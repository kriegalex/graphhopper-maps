import { coordinateToText, metersToText } from '@/Converters'
import Api, { ApiImpl } from '@/api/Api'
import Store from '@/stores/Store'
import Dispatcher, { Action } from '@/stores/Dispatcher'
import {
    AddPoint,
    ClearPoints,
    ErrorAction,
    InfoReceived,
    InvalidatePoint,
    MovePoint,
    RemovePoint,
    RouteRequestFailed,
    RouteRequestSuccess,
    SetCustomModel,
    SetCustomModelEnabled,
    SetPoint,
    SetQueryPoints,
    SetVehicleProfile,
    UpdateSegmentProfile,
} from '@/actions/Actions'
import { Bbox, Details, RoutingArgs, RoutingProfile, RoutingResult, Path, BasePath } from '@/api/graphhopper'
import { calcDist } from '@/distUtils'
import config from 'config'
import { customModel2prettyString, customModelExamples } from '@/sidebar/CustomModelExamples'

export interface Coordinate {
    lat: number
    lng: number
}

export function getBBoxFromCoord(c: Coordinate, offset: number = 0.005): Bbox {
    return [c.lng - offset, c.lat - offset, c.lng + offset, c.lat + offset]
}

export interface QueryStoreState {
    readonly profiles: RoutingProfile[]
    readonly queryPoints: QueryPoint[]
    readonly nextQueryPointId: number
    readonly currentRequest: CurrentRequest
    readonly segmentRouting: SegmentRouting
    readonly maxAlternativeRoutes: number
    readonly routingProfile: RoutingProfile
    readonly customModelEnabled: boolean
    readonly customModelStr: string
}

export interface QueryPoint {
    readonly coordinate: Coordinate
    readonly queryText: string
    readonly isInitialized: boolean
    readonly color: string
    readonly id: number
    readonly type: QueryPointType
    readonly segmentProfile: string
}

export interface CustomModel {
    readonly speed?: object[]
    readonly priority?: object[]
    readonly distance_influence?: number
    readonly areas?: object
}

export enum QueryPointType {
    From,
    To,
    Via,
}

export interface CurrentRequest {
    subRequests: SubRequest[]
}

export enum RequestState {
    SENT,
    SUCCESS,
    FAILED,
}

export interface SubRequest {
    readonly args: RoutingArgs
    readonly state: RequestState
}

/**
 * Represents a segment request for motorcycle routing with specific profiles per segment
 */
export interface SegmentRequest {
    readonly args: RoutingArgs;
    readonly state: RequestState;
    readonly result?: RoutingResult;
    readonly fromIdx: number;
    readonly toIdx: number;
}

/**
 * Container for all segment requests in a multi-segment route
 */
export interface SegmentRouting {
    readonly requests: SegmentRequest[];
    readonly isActive: boolean;
}

/**
 * Mutable versions of GraphHopper API interfaces for internal segment merging operations.
 * These interfaces mirror the readonly API interfaces but allow property modifications.
 */
export interface MutableRoutingResult {
    info: MutableRoutingResultInfo;
    paths: MutablePath[];
}

export interface MutableRoutingResultInfo {
    copyright: string[];
    road_data_timestamp: string;
    took: number;
}

export interface MutablePath extends Omit<BasePath, 'instructions' | 'details' | 'points_order' | 'bbox' | 'distance' | 'time' | 'ascend' | 'descend'> {
    distance: number;
    time: number;
    ascend: number;
    descend: number;
    bbox?: Bbox;
    instructions: MutableInstruction[];
    details: MutableDetails;
    points_order: number[];
    points: MutableLineString;
    snapped_waypoints: MutableLineString;
}

export interface MutableLineString {
    type: string;
    coordinates: number[][];
}

export interface MutableInstruction {
    distance: number;
    interval: [number, number];
    points: number[][];
    sign: number;
    text: string;
    motorway_junction: string;
    time: number;
}

export interface MutableDetails {
    street_name: [number, number, string][];
    toll: [number, number, string][];
    max_speed: [number, number, number][];
    road_class: [number, number, string][];
    road_environment: [number, number, string][];
    road_access: [number, number, string][];
    access_conditional: [number, number, string][];
    foot_conditional: [number, number, string][];
    bike_conditional: [number, number, string][];
    track_type: [number, number, string][];
    country: [number, number, string][];
    get_off_bike: [number, number, boolean][];
    mtb_rating: [number, number, boolean][];
    hike_rating: [number, number, boolean][];
}

export default class QueryStore extends Store<QueryStoreState> {
    private readonly api: Api

    constructor(api: Api, initialCustomModelStr: string | null = null) {
        super(QueryStore.getInitialState(initialCustomModelStr))
        this.api = api
    }

    private static getInitialState(initialCustomModelStr: string | null): QueryStoreState {
        const customModelEnabledInitially = initialCustomModelStr != null
        if (!initialCustomModelStr)
            initialCustomModelStr = customModel2prettyString(customModelExamples['default_example'])
        // prettify the custom model if it can be parsed or leave it as is otherwise
        try {
            initialCustomModelStr = customModel2prettyString(JSON.parse(initialCustomModelStr))
        } catch (e) {}

        return {
            profiles: [],
            queryPoints: [
                QueryStore.getEmptyPoint(0, QueryPointType.From),
                QueryStore.getEmptyPoint(1, QueryPointType.To),
            ],
            nextQueryPointId: 2,
            currentRequest: {
                subRequests: [],
            },
            segmentRouting: {
                requests: [],
                isActive: false
            },
            maxAlternativeRoutes: 3,
            routingProfile: {
                name: '',
            },
            customModelEnabled: customModelEnabledInitially,
            customModelStr: initialCustomModelStr,
        }
    }

    reduce(state: QueryStoreState, action: Action): QueryStoreState {
        if (action instanceof InvalidatePoint) {
            const points = QueryStore.replacePoint(state.queryPoints, {
                ...action.point,
                isInitialized: false,
            })
            return {
                ...state,
                queryPoints: points,
            }
        } else if (action instanceof ClearPoints) {
            const newPoints = state.queryPoints.map(point => {
                return {
                    ...point,
                    queryText: '',
                    point: { lat: 0, lng: 0 },
                    isInitialized: false,
                }
            })

            return {
                ...state,
                queryPoints: newPoints,
            }
        } else if (action instanceof SetPoint) {
            const newState: QueryStoreState = {
                ...state,
                queryPoints: QueryStore.replacePoint(state.queryPoints, action.point),
            }

            return this.routeIfReady(newState, action.zoomResponse)
        } else if (action instanceof MovePoint) {
            // Remove and Add in one action but with only one route request
            const newPoints = QueryStore.movePoint(state.queryPoints, action.point, action.newIndex).map(
                (point, index) => {
                    const type = QueryStore.getPointType(index, state.queryPoints.length)
                    return {
                        ...point,
                        color: QueryStore.getMarkerColor(type),
                        type: type,
                        id: this.state.nextQueryPointId + index,
                    }
                }
            )

            const newState = {
                ...state,
                nextQueryPointId: state.nextQueryPointId + state.queryPoints.length,
                queryPoints: newPoints,
            }
            return this.routeIfReady(newState, false)
        } else if (action instanceof AddPoint) {
            const tmp = state.queryPoints.slice()
            const queryText = action.isInitialized ? coordinateToText(action.coordinate) : ''
            const isMotorcycle = state.routingProfile.name.startsWith('motorcycle');

            // Default segmentProfile to 'twisty' for motorcycles, otherwise empty
            const initialSegmentProfile = isMotorcycle && action.atIndex > 0 ? 'twisty' : '';

            // add new point at the desired index
            tmp.splice(action.atIndex, 0, {
                coordinate: action.coordinate,
                id: state.nextQueryPointId,
                queryText: queryText,
                color: '',
                isInitialized: action.isInitialized,
                type: QueryPointType.Via,
                segmentProfile: initialSegmentProfile,
            })

            // determine colors for each point. I guess this could be smarter if this needs to be faster
            const newPoints = tmp.map((point, i) => {
                const type = QueryStore.getPointType(i, tmp.length)
                return { ...point, color: QueryStore.getMarkerColor(type), type: type }
            })

            const newState: QueryStoreState = {
                ...state,
                nextQueryPointId: state.nextQueryPointId + 1,
                queryPoints: newPoints,
            }

            return this.routeIfReady(newState, action.zoom)
        } else if (action instanceof SetQueryPoints) {
            const isMotorcycle = state.routingProfile.name.startsWith('motorcycle');
            // make sure that some things are set correctly, regardless of what was passed in here.
            const queryPoints = action.queryPoints.map((point, i) => {
                const type = QueryStore.getPointType(i, action.queryPoints.length)
                const queryText =
                    point.isInitialized && !point.queryText ? coordinateToText(point.coordinate) : point.queryText
                // Default segmentProfile to 'twisty' for motorcycles, otherwise empty
                const segmentProfile = isMotorcycle && i > 0 ? (point.segmentProfile || 'twisty') : '';
                return {
                    ...point,
                    id: state.nextQueryPointId + i,
                    type: type,
                    color: QueryStore.getMarkerColor(type),
                    queryText: queryText,
                    segmentProfile: segmentProfile,
                }
            })
            // make sure there are always at least two input boxes
            while (queryPoints.length < 2) {
                const type = QueryStore.getPointType(queryPoints.length, 2)
                queryPoints.push({
                    id: queryPoints.length,
                    type: type,
                    color: QueryStore.getMarkerColor(type),
                    queryText: '',
                    isInitialized: false,
                    coordinate: { lat: 0, lng: 0 },
                    segmentProfile: '',
                })
            }
            const nextId = state.nextQueryPointId + queryPoints.length

            return this.routeIfReady(
                {
                    ...state,
                    queryPoints: queryPoints,
                    nextQueryPointId: nextId,
                },
                true
            )
        } else if (action instanceof RemovePoint) {
            const newPoints = state.queryPoints
                .filter(point => point.id !== action.point.id)
                .map((point, i) => {
                    const type = QueryStore.getPointType(i, state.queryPoints.length - 1)
                    return { ...point, color: QueryStore.getMarkerColor(type), type: type }
                })

            const newState: QueryStoreState = {
                ...state,
                queryPoints: newPoints,
            }
            return this.routeIfReady(newState, false)
        } else if (action instanceof InfoReceived) {
            // Do nothing if no routing profiles were received
            if (action.result.profiles.length <= 0) return state

            // if there are profiles defined in the config file use them, otherwise use the profiles from /info
            const profiles: RoutingProfile[] = config.profiles
                ? Object.keys(config.profiles).map(profile => ({ name: profile }))
                : action.result.profiles

            // if a routing profile was in the url keep it, otherwise select the first entry as default profile
            const profile = state.routingProfile.name ? state.routingProfile : profiles[0]
            return this.routeIfReady(
                {
                    ...state,
                    profiles,
                    routingProfile: profile,
                },
                true
            )
        } else if (action instanceof SetVehicleProfile) {
            const isNewProfileMotorcycle = action.profile.name.startsWith('motorcycle');

            const updatedPoints = state.queryPoints.map((point, index) => {
                if(isNewProfileMotorcycle) {
                    // For motorcycle profiles, set the segment profile to 'twisty' for all points except the first
                    if (index > 0 && point.segmentProfile === '') {
                        return { ...point, segmentProfile: 'twisty' };
                    }
                } else {
                    // For non-motorcycle profiles, reset the segment profile
                    if(point.segmentProfile !== '') {
                        return { ...point, segmentProfile: '' };
                    }
                }
                return point;
            });

            const newState: QueryStoreState = {
                ...state,
                routingProfile: action.profile,
                queryPoints: updatedPoints,
            }

            return this.routeIfReady(newState, true)
        } else if (action instanceof SetCustomModel) {
            const newState = {
                ...state,
                customModelStr: action.customModelStr,
            }
            return action.issueRoutingRequest ? this.routeIfReady(newState, true) : newState
        } else if (action instanceof RouteRequestSuccess || action instanceof RouteRequestFailed) {
            // Determine if this is a segment request
            const isSegmentRequest = state.segmentRouting.isActive && 
                state.segmentRouting.requests.some(segment => segment.args === action.request);

            if (isSegmentRequest) {
                return QueryStore.handleSegmentRequestUpdate(state, action);
            } else {
                return QueryStore.handleFinishedRequest(state, action)
            }
        } else if (action instanceof SetCustomModelEnabled) {
            const newState: QueryStoreState = {
                ...state,
                customModelEnabled: action.enabled,
            }
            return this.routeIfReady(newState, true)
        } else if(action instanceof UpdateSegmentProfile) {
            const newPoints = state.queryPoints.map((point, idx) => {
                if (idx === action.index) {
                    // Create a new point with updated segmentProfile
                    return {
                        ...point,
                        segmentProfile: action.profile
                    };
                }
                return point;
            });
            
            const newState = {
                ...state,
                queryPoints: newPoints
            };
            
            return this.routeIfReady(newState, true);
        }
        return state
    }

    private static handleFinishedRequest(
        state: QueryStoreState,
        action: RouteRequestSuccess | RouteRequestFailed
    ): QueryStoreState {
        const newState = action instanceof RouteRequestSuccess ? RequestState.SUCCESS : RequestState.FAILED
        const newSubrequests = QueryStore.replaceSubRequest(state.currentRequest.subRequests, action.request, newState)

        return {
            ...state,
            currentRequest: {
                subRequests: newSubrequests,
            },
        }
    }
    
    private static handleSegmentRequestUpdate(
        state: QueryStoreState,
        action: RouteRequestSuccess | RouteRequestFailed
    ): QueryStoreState {
        const newState = action instanceof RouteRequestSuccess ? RequestState.SUCCESS : RequestState.FAILED;
        const result = action instanceof RouteRequestSuccess ? action.result : undefined;
        
        // Find the segment that matches this request
        const newSegmentRequests = state.segmentRouting.requests.map(segment => {
            if (segment.args === action.request) {
                return { ...segment, state: newState, result };
            }
            return segment;
        });

        // Check if all segments are complete
        const allComplete = newSegmentRequests.every(segment => 
            segment.state === RequestState.SUCCESS || segment.state === RequestState.FAILED
        );
        
        const allSuccessful = newSegmentRequests.every(segment => 
            segment.state === RequestState.SUCCESS && segment.result
        );
        
        // If all segments completed successfully, combine them
        if (allComplete && allSuccessful) {
            // Reset segment routing to prevent recursive handling
            const finalState = {
                ...state,
                segmentRouting: {
                    requests: [],
                    isActive: false
                }
            };
            
            // This will be handled by the dispatcher in a separate method
            setTimeout(() => {
                const results = newSegmentRequests
                    .filter(segment => segment.state === RequestState.SUCCESS && segment.result)
                    .map(segment => segment.result!);
                
                const combinedResult = QueryStore.combineSegmentResults(results);
                
                // Dispatch a combined result
                Dispatcher.dispatch(new RouteRequestSuccess(
                    // Use first request's args as the parent
                    newSegmentRequests[0].args,
                    action instanceof RouteRequestSuccess ? action.zoom : false,
                    combinedResult
                ));
            }, 0);

            return finalState;
        }

        return {
            ...state,
            segmentRouting: {
                ...state.segmentRouting,
                requests: newSegmentRequests,
            },
        };
    }

    private routeIfReady(state: QueryStoreState, zoom: boolean): QueryStoreState {
        if (QueryStore.isReadyToRoute(state)) {
            // Check if we have any segment profiles specified
            const hasSegmentProfiles = state.queryPoints.some((point, index) => index > 0 && point.segmentProfile);
            
            if (hasSegmentProfiles) {
                // Process segment-by-segment
                return this.routeWithSegments(state, zoom);
            } else {
                // Reset segment routing when switching back to normal routing
                let updatedState = {
                    ...state,
                    segmentRouting: {
                        requests: [],
                        isActive: false
                    }
                };

                let requests
                const maxDistance = getMaxDistance(updatedState.queryPoints)
                if (updatedState.customModelEnabled) {
                    if (maxDistance < 200_000) {
                        // Use a single request, possibly including alternatives when custom models are enabled.
                        requests = [QueryStore.buildRouteRequest(updatedState)]
                    } else if (maxDistance < 700_000) {
                        // Force no alternatives for longer custom model routes.
                        requests = [
                            QueryStore.buildRouteRequest({
                                ...updatedState,
                                maxAlternativeRoutes: 1,
                            }),
                        ]
                    } else {
                        // Custom model requests with large distances take too long, so we just error.
                        // later: better usability if we just remove ch.disable? i.e. the request always succeeds
                        Dispatcher.dispatch(
                            new ErrorAction(
                                'Using the custom model feature is unfortunately not ' +
                                    'possible when the request points are further than ' +
                                    // todo: use settings#showDistanceInMiles, but not sure how to use state from another store here
                                    metersToText(700_000, false) +
                                    ' apart.'
                            )
                        )
                        return updatedState
                    }
                } else {
                    requests = [
                        // We first send a fast request without alternatives ...
                        QueryStore.buildRouteRequest({
                            ...updatedState,
                            maxAlternativeRoutes: 1,
                        }),
                    ]
                    // ... and then a second, slower request including alternatives if they are enabled.
                    if (
                        updatedState.queryPoints.length === 2 &&
                        updatedState.maxAlternativeRoutes > 1 &&
                        ((ApiImpl.isMotorVehicle(updatedState.routingProfile.name) && maxDistance < 7_000_000) ||
                            maxDistance < 500_000)
                    )
                        requests.push(QueryStore.buildRouteRequest(updatedState))
                }

                return {
                    ...updatedState,
                    currentRequest: { subRequests: this.send(requests, zoom) },
                }
            }
        }
        return state
    }

    private send(args: RoutingArgs[], zoom: boolean) {
        const subRequests = args.map(arg => {
            return {
                args: arg,
                state: RequestState.SENT,
            }
        })

        subRequests.forEach((subRequest, i) => this.api.routeWithDispatch(subRequest.args, i == 0 ? zoom : false))
        return subRequests
    }

    private static isReadyToRoute(state: QueryStoreState) {
        if (state.customModelEnabled)
            try {
                JSON.parse(state.customModelStr)
            } catch {
                return false
            }
        // Janek deliberately chose this style of if statements, to make this readable.
        if (state.queryPoints.length <= 1) return false
        if (!state.queryPoints.every(point => point.isInitialized)) return false
        if (!state.routingProfile.name) return false
        
        // Check for motorcycle profiles specifically
        if (state.routingProfile.name.startsWith('motorcycle')) {
            const hasInvalidSegmentProfile = state.queryPoints.some(point => {
                // If there's a segment profile, it must be one of the allowed values
                return point.segmentProfile && !['highway', 'twisty'].includes(point.segmentProfile);
            });
            
            if (hasInvalidSegmentProfile) return false;
        } else {
            // For non-motorcycle profiles, ensure no segment profiles are set
            const hasSegmentProfiles = state.queryPoints.some(point => point.segmentProfile);
            if (hasSegmentProfiles) {
                // Create a new state with updated query points
                return {
                    ...state,
                    queryPoints: state.queryPoints.map(point => ({
                        ...point,
                        segmentProfile: ''
                    }))
                };
            }
        }

        return true
    }

    private static movePoint(points: QueryPoint[], point: QueryPoint, newIndex: number): QueryPoint[] {
        if (newIndex < 0) return points

        const newPoints = points.filter((p, index) => {
            if (p.id == point.id) {
                if (index < newIndex) newIndex-- // index adjustment is important
                return false
            }
            return true
        })

        if (newIndex >= points.length) return points
        newPoints.splice(newIndex, 0, point)
        return newPoints
    }

    private static replacePoint(points: QueryPoint[], point: QueryPoint) {
        return replace(
            points,
            p => p.id === point.id,
            () => point
        )
    }

    private static replaceSubRequest(subRequests: SubRequest[], args: RoutingArgs, state: RequestState) {
        return replace(
            subRequests,
            r => r.args === args,
            r => {
                return { ...r, state }
            }
        )
    }

    public static getMarkerColor(type: QueryPointType) {
        switch (type) {
            case QueryPointType.From:
                return '#7cb342'
            case QueryPointType.To:
                return '#F97777'
            default:
                return '#76D0F7'
        }
    }

    private static getPointType(index: number, numberOfPoints: number) {
        if (index === 0) return QueryPointType.From
        if (index === numberOfPoints - 1) return QueryPointType.To
        return QueryPointType.Via
    }

    private static buildRouteRequest(state: QueryStoreState): RoutingArgs {
        const coordinates = state.queryPoints.map(point => [point.coordinate.lng, point.coordinate.lat]) as [
            number,
            number
        ][]

        let customModel = null
        if (state.customModelEnabled)
            try {
                customModel = JSON.parse(state.customModelStr)
            } catch {}

        return {
            points: coordinates,
            profile: state.routingProfile.name,
            maxAlternativeRoutes: state.maxAlternativeRoutes,
            customModel: customModel,
        }
    }

    private static getEmptyPoint(id: number, type: QueryPointType): QueryPoint {
        return {
            isInitialized: false,
            queryText: '',
            coordinate: { lat: 0, lng: 0 },
            id: id,
            color: QueryStore.getMarkerColor(type),
            type: type,
            segmentProfile: '',
        }
    }

    private routeWithSegments(state: QueryStoreState, zoom: boolean): QueryStoreState {
        const segments: SegmentRequest[] = [];
        // Check if we're working with a motorcycle profile
        const isMotorcycleProfile = state.routingProfile.name.startsWith('motorcycle');
        
        // Build segments based on profile changes
        for (let i = 1; i < state.queryPoints.length; i++) {
            const fromPoint = state.queryPoints[i-1];
            const toPoint = state.queryPoints[i];
            
            // Get the segment profile or use the main routing profile
            let segmentProfile = toPoint.segmentProfile || '';
            
            // Map segment profile to actual profile name for motorcycle routes
            let profile;
            if (isMotorcycleProfile && segmentProfile) {
                if (segmentProfile === 'twisty') {
                    // For 'twisty' segments, use the base 'motorcycle' profile
                    profile = 'motorcycle';
                } else {
                    // For other segments (like 'highway'), use the prefixed name
                    profile = `motorcycle_${segmentProfile}`;
                }
            } else {
                profile = state.routingProfile.name;
            }
            
            const points: [number, number][] = [
                [fromPoint.coordinate.lng, fromPoint.coordinate.lat],
                [toPoint.coordinate.lng, toPoint.coordinate.lat]
            ];

            // Create request args
            const args: RoutingArgs = {
                points: points,
                profile: profile,
                maxAlternativeRoutes: 1, // No alternatives for segments
                customModel: state.customModelEnabled ? JSON.parse(state.customModelStr) : null,
            };
            
            // Add to segment requests
            segments.push({
                args: args,
                state: RequestState.SENT,
                fromIdx: i-1,
                toIdx: i,
            });
        }

        // Generate a unique batch ID for this routing request
        const batchId = Date.now();
        
        // Send all routing requests
        segments.forEach(segment => {
            this.api.routeWithSegmentDispatch(segment.args, zoom, batchId);
        });
        
        // Return updated state with segment routing active
        return {
            ...state,
            segmentRouting: {
                requests: segments,
                isActive: true
            },
            // Clear standard requests to avoid conflicts
            currentRequest: {
                subRequests: []
            }
        };
    }

    private static combineSegmentResults(results: RoutingResult[]): RoutingResult {
        if (results.length === 0) return {
            paths: [],
            info: { copyright: [], road_data_timestamp: '', took: 0 }
        };
        
        // Early validation - ensure all results have at least one path
        if (results.some(result => !result.paths || result.paths.length === 0)) {
            console.warn("Some segment results have no paths");
            // Filter out segments with no paths
            results = results.filter(result => result.paths && result.paths.length > 0);
        }
        
        if (results.length === 0) return {
            paths: [],
            info: { copyright: [], road_data_timestamp: '', took: 0 }
        };
        
        // Convert first path to mutable version for modifications
        const mutablePath = toMutablePath(results[0].paths[0]);
        
        // Combine with subsequent segments
        for (let i = 1; i < results.length; i++) {
            this.mergePathSegment(mutablePath, results[i].paths[0]);
        }
        
        return {
            paths: [toReadonlyPath(mutablePath)],
            info: {...results[0].info}
        };
    }
    
    private static mergePathSegment(combinedPath: MutablePath, path: Path): void {
        // Update metrics
        combinedPath.distance += path.distance;
        combinedPath.time += path.time;
        combinedPath.ascend += (path.ascend || 0);
        combinedPath.descend += (path.descend || 0);
        
        // Append coordinates (skip first point to avoid duplication)
        const coords = path.points.coordinates;
        const lastPointIndex = combinedPath.points.coordinates.length - coords.length + 1;
        
        // Validate segment connection
        if (coords.length > 0) {
            const lastPoint = combinedPath.points.coordinates[combinedPath.points.coordinates.length - 1];
            const firstPoint = coords[0];
            
            // Log a warning if segments don't connect well (allow small tolerance)
            const tolerance = 0.00001; // ~1m tolerance
            if (Math.abs(lastPoint[0] - firstPoint[0]) > tolerance || 
                Math.abs(lastPoint[1] - firstPoint[1]) > tolerance) {
                console.warn("Segments don't perfectly align - possible discontinuity in route");
            }
            
            combinedPath.points.coordinates = [
                ...combinedPath.points.coordinates,
                ...coords.slice(1)
            ];
        }
        
        this.mergeInstructions(combinedPath, path, lastPointIndex);
        this.mergeBbox(combinedPath, path);
        this.mergeDetails(combinedPath, path, lastPointIndex);
        this.mergeWaypoints(combinedPath, path);
    }
    
    private static mergeInstructions(combinedPath: MutablePath, path: Path, lastPointIndex: number): void {
        // Adjust and append instructions - ensure proper typing
        const adjustedInstructions = path.instructions.map(instruction => {
            const newInterval: [number, number] = [
                instruction.interval[0] + lastPointIndex,
                instruction.interval[1] + lastPointIndex
            ];
            
            return {
                ...instruction,
                interval: newInterval,
                points: instruction.points.map(point => [...point]) // deep copy array
            };
        });
        combinedPath.instructions = [...combinedPath.instructions, ...adjustedInstructions];
    }
    
    private static mergeBbox(combinedPath: MutablePath, path: Path): void {
        // Update bbox if present - with proper type handling
        if (combinedPath.bbox && path.bbox) {
            combinedPath.bbox = [
                Math.min(combinedPath.bbox[0], path.bbox[0]),
                Math.min(combinedPath.bbox[1], path.bbox[1]),
                Math.max(combinedPath.bbox[2], path.bbox[2]),
                Math.max(combinedPath.bbox[3], path.bbox[3])
            ];
        } else if (path.bbox) {
            combinedPath.bbox = [...path.bbox]; // Copy if we didn't have one
        }
    }
    
    private static mergeWaypoints(combinedPath: MutablePath, path: Path): void {
        // Update snapped waypoints
        if (path.snapped_waypoints && path.snapped_waypoints.coordinates.length > 0) {
            // Only add the final waypoint from each segment
            const lastPoint = [...path.snapped_waypoints.coordinates[path.snapped_waypoints.coordinates.length - 1]];
            combinedPath.snapped_waypoints.coordinates.push(lastPoint);
        }
    }
    
    private static mergeDetails(combinedPath: MutablePath, path: Path, lastPointIndex: number): void {
        // Merge details (road attributes, etc.) with type safety
        (Object.keys(combinedPath.details) as Array<keyof Details>).forEach(key => {
            if (path.details[key] && path.details[key].length > 0) {
                const detailOffset = lastPointIndex;
                
                // Type-safe way to handle the specific types in details based on the key
                switch (key) {
                    case 'max_speed':
                        const maxSpeedDetails = path.details[key].map(detail => {
                            return [
                                detail[0] + detailOffset,
                                detail[1] + detailOffset,
                                detail[2]
                            ] as [number, number, number];
                        });
                        combinedPath.details[key] = [...combinedPath.details[key], ...maxSpeedDetails];
                        break;
                        
                    case 'get_off_bike':
                    case 'mtb_rating':
                    case 'hike_rating':
                        const booleanDetails = path.details[key].map(detail => {
                            return [
                                detail[0] + detailOffset,
                                detail[1] + detailOffset,
                                detail[2]
                            ] as [number, number, boolean];
                        });
                        combinedPath.details[key] = [...combinedPath.details[key], ...booleanDetails];
                        break;
                        
                    default:
                        // Handle all string detail types (street_name, toll, road_class, etc.)
                        const stringDetails = path.details[key].map(detail => {
                            return [
                                detail[0] + detailOffset,
                                detail[1] + detailOffset,
                                detail[2]
                            ] as [number, number, string];
                        });
                        combinedPath.details[key] = [...combinedPath.details[key], ...stringDetails];
                        break;
                }
            }
        });
    }
}

function replace<T>(array: T[], compare: { (element: T): boolean }, provider: { (element: T): T }) {
    const result = []

    for (const element of array) {
        if (compare(element)) result.push(provider(element))
        else result.push(element)
    }

    return result
}

function getMaxDistance(queryPoints: QueryPoint[]): number {
    let max = 0
    for (let idx = 1; idx < queryPoints.length; idx++) {
        const dist = calcDist(queryPoints[idx - 1].coordinate, queryPoints[idx].coordinate)
        max = Math.max(dist, max)
    }
    return max
}

/**
 * Converts a readonly Path to a mutable MutablePath
 */
export function toMutablePath(path: Path): MutablePath {
    return {
        ...path,
        distance: path.distance,
        time: path.time,
        ascend: path.ascend,
        descend: path.descend,
        bbox: path.bbox ? [...path.bbox] : undefined,
        points: {
            type: path.points.type,
            coordinates: [...path.points.coordinates.map(coord => [...coord])]
        },
        snapped_waypoints: {
            type: path.snapped_waypoints.type,
            coordinates: [...path.snapped_waypoints.coordinates.map(coord => [...coord])]
        },
        instructions: path.instructions.map(instruction => ({
            ...instruction,
            points: instruction.points.map(point => [...point]), // Deep copy of nested arrays
            interval: [...instruction.interval] // Also ensure interval is copied
        })),
        details: Object.entries(path.details).reduce((acc, [key, value]) => {
            // Type the item parameter based on the expected structure in MutableDetails
            acc[key as keyof MutableDetails] = [...value.map((item: [number, number, string | number | boolean]) => [...item])];
            return acc;
        }, {} as MutableDetails),
        points_order: Array.isArray(path.points_order) ? [...path.points_order] : [],
    };
}

/**
 * Converts a mutable MutablePath back to a readonly Path
 */
export function toReadonlyPath(path: MutablePath): Path {
    return path as unknown as Path;
}
