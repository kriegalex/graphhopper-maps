# PLANNING.md

## High-Level Overview

This document outlines the essential components and considerations for improving the map functionality of a React-based application regarding Switzerland. The new features to implement include centering the map around Switzerland, enhancing layer management, and enabling routing between multiple waypoints with distinct segment profiles.

## Key Terms and Concepts

### Map Centering
- The initial view of the map should be positioned to emphasize Switzerland, requiring geographical coordinates (latitude and longitude).

### Flexible Map Layers
- The map's layer configuration should allow for dynamic adjustments via configuration parameters.
- This requires creating a robust system for managing API keys and layer settings, promoting maintainability and scalability.

### Waypoint Routing
- Implementing routing functionality that supports multiple waypoints, each with unique segment.
- This necessitates a clear definition of segment profiles and their relationship to global routing profiles.

## GraphHopper API Integration Considerations

The project interfaces with the GraphHopper API, which uses primarily readonly interfaces. Key points to consider:

- Most of the GraphHopper API types use readonly properties, preventing direct mutation of returned data
- API responses including RoutingResult, Path, and Instruction objects must be treated as immutable
- When working with these types, we'll need to create new objects rather than attempting to modify the returned data
- For operations requiring data transformation, we should implement mapping functions that create new objects with the desired structure

## Required Technologies

- **React**: For building user interfaces with React JSX.
- **TypeScript**: Strict typing for all components and functions following the project's tsconfig.json.
- **GraphHopper API**: For routing and geocoding functionality with immutable response structures.
- **Mapping Libraries**: Examples include Mapbox or Leaflet for rendering maps and managing spatial data.
- **State Management**: Implement Redux or Context API for state management regarding map layers and routing information, with careful handling of readonly API objects.
- **API Integration**: Understand the API requirements for layer management and routing systems while respecting immutability constraints.

## TypeScript Configuration Requirements

The project uses a specific TypeScript configuration as defined in tsconfig.json:

```json
{
    "compilerOptions": {
        "outDir": "./dist/",
        "sourceMap": true,
        "noImplicitAny": true,
        "jsx": "react-jsx",
        "allowSyntheticDefaultImports": true,
        "baseUrl": ".",
        "importHelpers": true,
        "module": "ES2015",
        "moduleResolution": "node",
        "noImplicitReturns": true,
        "strict": true,
        "target": "ES2019",
        "paths": {
            "@/*": ["src/*"],
        },
        "lib": ["ES2019", "dom", "dom.iterable"],
        "esModuleInterop": true,
        "resolveJsonModule": true,
        "skipLibCheck": true
    },
    "include": ["./src/**/*", "./test/**/*"],
}
```

### Key configuration aspects to consider during implementation:

- Strict type checking is enabled (`strict: true`, `noImplicitAny: true`)
- Path aliases using `@/*` for src directory references
- ES2019 target with modern module resolution
- React JSX support using the new JSX transform

## Best Practices

1. Follow the component-based architecture to ensure reusability and maintainability of map features.
2. Leverage TypeScript's strict mode to enhance type safety and reduce errors, especially when managing dynamic configurations.
3. Create wrapper functions for API interactions that handle the immutability requirements of GraphHopper API types.
4. Use path aliases (`@/*`) for cleaner imports following the project structure.
5. Implement immutable update patterns when working with GraphHopper API data structures.
6. Write unit tests and integration tests for any new functionality added, placing them in the test directory.
7. Utilize ES2019 features where appropriate while ensuring browser compatibility.

## Collaboration and Documentation

1. Ensure collaboration with backend developers for API requirements and integration.
2. Maintain comprehensive documentation for each newly created function, component, and configuration option to enable easy understanding and use by other developers.
3. Document all types and interfaces to provide clear contracts for components and functions.
4. Clearly document immutability requirements when working with GraphHopper API types.