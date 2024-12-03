# Earth 3D viewer

This project is an experimentation with Google Photorealistic 3D Tiles in [Three.js](https://threejs.org).

[Check it out here!](https://earth-3d-viewer.xavier.willemin.swiss)

You can select a location (city, address) in the search bar top right. Google Maps JavaScript API shows suggestions of places while you type.

If you are over Switzerland, you can also display swisstopo's [swissBUILDINGS3D](https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta), [swissTLM3D](https://www.swisstopo.admin.ch/en/landscape-model-swisstlm3d) and vegetation layers by toggling the appropriate layer(s) in the botton left panel. You can also reduce the opacity of the Google Photosorealistic 3D Tiles for better visibility of the swisstopo layers by moving the opacity slider.

## How to navigate

-   (Left) Click and drag to move on the terrain.
-   Right click and drag to pivot around the clicked point in the globe.
-   Scroll up/down to zoom out/in respectively.

## Future improvements

-   Display swisstopo's [SWISSIMAGE](https://www.swisstopo.admin.ch/en/orthoimage-swissimage-10) as terrain texture with [swissALTI3D](https://www.swisstopo.admin.ch/en/height-model-swissalti3d) as altitude model instead of Google Photosorealistic 3D Tiles over Switzerland for better quality and improved user experience (no overlapping of 3D buildings).
-   Display swisstopo's [swissNAMES3D](https://www.swisstopo.admin.ch/en/landscape-model-swissnames3d) (geo-referenced swiss locations) to improve terrain navigation.
-   Performance optimizations.
