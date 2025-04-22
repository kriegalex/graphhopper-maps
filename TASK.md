# Overview of Individual Tasks

This document details the tasks required to add new features to the mapping functionality within the React application. Each task requires specific implementation steps and should reference the overarching goals outlined in PLANNING.md.

## Task Tracking

Each task below includes a status tag that follows this format:
- `STATUS: NOT_STARTED` - Task has not been started yet
- `STATUS: IN_PROGRESS` - Task is currently being worked on
- `STATUS: COMPLETED` - Task has been completed successfully
- `STATUS: INCOMPLETE` - Task has been partially implemented but requires significant work
- `STATUS: BLOCKED` - Task is blocked by another task or external factor

## Task 1: Centering the Map Around Switzerland
**STATUS: COMPLETED**

### Objective
Set the initial geographic center of the map to Switzerland.

### Steps
1. ✅ Define a TypeScript interface for map center coordinates and zoom level configuration.
2. ✅ Identify the geographic coordinates for Switzerland (approx. latitude 46.8182, longitude 8.2275).
3. ✅ Update the map initialization logic to use these coordinates when rendering the map.
4. ✅ Implement strict typing for all parameters and return values.
5. ✅ Test to ensure the map displays correctly centered on Switzerland.

### Implementation Details
- Implemented in commit `e2a6671` ("Adapt map for Switzerland")
- Modified files: `src/map/map.ts` and `src/stores/MapOptionsStore.ts`
- Set map center to [8.2275, 46.8182] and zoom level to 8
- Added Swiss-specific map layers (Swisstopo National and Swisstopo Light)

## Task 2: Implement Flexible Map Layer Management
**STATUS: INCOMPLETE**

### Objective
Enable dynamic management of map layers through configuration parameters.

### Steps
1. ✅ Create TypeScript interfaces for layer configurations, including required properties and API keys.
2. ❌ Create a proper configuration file to define layer settings and API keys.
3. ✅ Update existing map components to fetch layer configuration from the new configuration file.
4. ❌ Implement functions with proper TypeScript typing to add, remove, and toggle layers based on configuration input.
5. ✅ Use the project's path alias system (`@/*`) for importing related modules.
6. ✅ Ensure strict type checking for all layer management operations.
7. ❌ Perform testing to validate that layer configurations dynamically affect the map display.

### Implementation Details
- Implemented in commit `ab4bac9` ("Add basic openmaptiles support")
- Current implementation has most map layers commented out in styleOptions array
- Only hardcoded OSM layers are available
- OpenMapTiles is supported but without a proper configuration mechanism

### Remaining Work
1. Create a proper layer configuration system that allows dynamic enabling/disabling of layers
2. Reinstate all map layers with configuration options
3. Implement fallback mechanisms for API keys and URLs
4. Create UI components to manage available layers
5. Add tests for the layer configuration system

## Task 3: Routing Between Multiple Waypoints
**STATUS: INCOMPLETE**

### Objective
Allow routing functionality to support multiple waypoints with distinct segment profiles.

### Steps
1. ✅ Study the existing GraphHopper type definitions (`graphhopper.d.ts`) to understand the readonly constraints.
2. ✅ Define TypeScript interfaces for waypoint structures and segment profiles that work with the readonly GraphHopper types.
3. ✅ Design routing functions that respect the immutability of GraphHopper API types.
4. ✅ Implement transformation functions that create new objects when modifying data from API responses.
5. ✅ Create UI components for selecting waypoints and their profiles visually, with appropriate prop and state types.
6. ✅ Ensure all functions properly handle return types and edge cases following noImplicitReturns requirements.
7. ❌ Conduct thorough route testing to verify accuracy and performance.

### Implementation Details
- Implemented in commit `f8b5f98` ("Add multi segment routing requests for motorcycles")
- Functionality works but is limited to motorcycle profiles only
- Missing proper error handling for edge cases
- No unit or integration tests for the feature

### Remaining Work
1. Implement comprehensive unit tests for segment routing logic
2. Add integration tests for the full routing workflow
3. Improve error handling for segment route failures
4. Test edge cases (large routes, multiple segment failures)
5. Add support for segment profiles for other vehicle types beyond motorcycles

## Task 4: Handling GraphHopper API Immutability
**STATUS: COMPLETED**

### Objective
Create utility functions to handle the transformation of readonly GraphHopper API objects.

### Steps
1. ✅ Implement transformation utilities that create new objects rather than modifying existing ones
2. ✅ Create builders or factory functions for constructing API request objects
3. ✅ Implement state management that preserves immutability when storing and updating API response data
4. ✅ Write unit tests for these utility functions to ensure they maintain data integrity

### Implementation Details
- Implemented as part of commit `f8b5f98` ("Add multi segment routing requests for motorcycles")
- Created helper functions `toMutablePath` and `toReadonlyPath` for transforming between readonly and mutable versions
- Implemented route segment merging logic that respects the immutable pattern
- Defined mutable interface versions for all readonly GraphHopper API types

## Task 5: Documentation and Testing
**STATUS: INCOMPLETE**

### Objective
Document all new features and ensure robust testing frameworks are in place.

### Steps
1. ✅ Update project documentation to include new functionality, usage, and examples.
2. ✅ Document all TypeScript interfaces and types in relevant files.
3. ✅ Add specific documentation about handling readonly GraphHopper API types.
4. ❌ Write unit tests for individual components and integration tests for workflows involving the new map features.
5. ✅ Place tests in the test directory according to the project structure.
6. ❌ Include specific tests for proper handling of readonly properties and immutable updates.
7. ✅ Ensure tests are written with TypeScript and follow the same strict type checking rules.
8. ❌ Review test coverage and ensure key scenarios are adequately addressed.

### Remaining Work
1. Create comprehensive unit tests for multi-segment routing
2. Implement integration tests that verify the end-to-end functionality
3. Test edge cases and error handling scenarios
4. Add tests for map layer configuration
5. Create documentation for users on how to use the new features

## Task 6: TypeScript Compliance and Code Quality
**STATUS: COMPLETED**

### Objective
Ensure all new code follows the project's TypeScript configuration and best practices.

### Steps
1. ✅ Verify all new code passes TypeScript compilation with the project's strict settings.
2. ✅ Review usage of path aliases (`@/*`) for consistency across the codebase.
3. ✅ Check that no implicit any types are introduced in the codebase.
4. ✅ Ensure all functions have explicit return types and handle all potential return paths.
5. ✅ Verify that the code properly respects readonly modifiers in GraphHopper API types.
6. ✅ Use modern ES2019 features supported by the TypeScript configuration where appropriate.
7. ✅ Run linting and type checking before submitting changes.
8. ✅ Implement immutable update patterns consistently throughout the codebase.

### Implementation Details
- The code across all implemented features follows TypeScript's strict mode requirements
- Path aliases (`@/*`) are consistently used for imports throughout the codebase
- All functions have explicit return types and handle all potential return paths
- The implementation properly respects readonly modifiers in GraphHopper API types through custom mutable interfaces