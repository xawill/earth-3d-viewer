import { Color, Vector3 } from 'three';
import { LatLng } from '../utils/map-utils';

export const ENABLE_DEBUG_PLUGIN = false;

export const GIGABYTE_BYTES = 2 ** 30;
export const LARGE_PRIME_1 = 7381;
export const LARGE_PRIME_2 = 1931;
export const LARGE_PRIME_3 = 8349;

export const VIIRS_BLACK_MARBLE_TILES_URL =
	'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
export const SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL =
	'https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json';
export const SWISSTOPO_TLM_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json';
export const SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL =
	'https://3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/tileset.json';
export const SWISSTOPO_NAMES_3D_TILES_TILESET_URL =
	'https://3d.geo.admin.ch/3d-tiles/ch.swisstopo.swissnames3d.3d/20180716/tileset.json';
export const SWISSTOPO_TERRAIN_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1/layer.json';
export const SWISSTOPO_WMTS_CAPABILITIES_URL = 'https://wmts.geo.admin.ch/EPSG/3857/1.0.0/WMTSCapabilities.xml?lang=en'; //To test/debug tiles indexing: https://codepen.io/xawill/pen/Wbrveqb

export const SWISSTOPO_BASE_LAYERS = [
	'ch.swisstopo.swissimage-product',
	'ch.swisstopo.pixelkarte-farbe-pk25.noscale',
	'ch.bazl.luftfahrtkarten-icao',
];
export const DEFAULT_SWISSTOPO_BASE_LAYER = 'ch.swisstopo.swissimage-product';
export const SWISSTOPO_ADDITIONAL_LAYERS = [
	'ch.bfs.volkszaehlung-bevoelkerungsstatistik_einwohner',
	'ch.bafu.tranquillity-karte',
	//'ch.bafu.gefaehrdungskarte-oberflaechenabfluss',
	//'ch.bafu.laerm-strassenlaerm_nacht',
	//'ch.pronatura.naturschutzgebiete',
	//'ch.are.erreichbarkeit-oev',
	//'ch.swisstopo.swisstlm3d-wanderwege',
	//'ch.bazl.einschraenkungen-drohnen',
	//'ch.are.reisezeit-agglomerationen-oev',
	//'ch.bafu.schutzgebiete-luftfahrt',
	//'ch.bfe.ladebedarfswelt-fahrzeuge',
	//'ch.bfe.fernwaerme-nachfrage_wohn_dienstleistungsgebaeude',
	//'ch.bfe.solarenergie-eignung-daecher',
	//'ch.bakom.anschlussart-glasfaser',
	//'ch.bakom.standorte-mobilfunkanlagen',
	//'ch.vbs.panzerverschiebungsrouten',
	//'ch.blw.bewaesserungsbeduerftigkeit',
	//'ch.bfs.betriebszaehlungen-beschaeftigte_vollzeitaequivalente',
];
export const DEFAULT_ADDITIONAL_LAYER_OPACITY = 0.66;

// TODO: Au clic, date d'image: https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometry=678250,213000&geometryFormat=geojson&geometryType=esriGeometryPoint&imageDisplay=1391,1070,96&lang=fr&layers=all:ch.swisstopo.images-swissimage-dop10.metadata&mapExtent=100,100,100,100&returnGeometry=true&tolerance=5

export const DEFAULT_START_COORDS: LatLng = { lat: 46.516591, lng: 6.629047 };
export const HEIGHT_FULL_GLOBE_VISIBLE = 7000000;
export const HEIGHT_ABOVE_TARGET_COORDS_ELEVATION = 1000; // [m]
export const TOLERANCE_DISTANCE_COORDS_NO_WAIT_TO_DESCENT = 500000; // [m]
export const SWITZERLAND_REGION_CAMERA_ELEVATION_THRESHOLD = 350000; // [m]
export const SWISS_GEOID_ELLIPSOID_OFFSET = new Vector3(34, 5, 36); // We empirically find the approximate offset with Google Photorealistic 3D Tiles at Gare de Vevey to have them more or less aligned. Read more here https://www.swisstopo.admin.ch/fr/geoid-fr and https://bertt.wordpress.com/2023/07/11/adding-objects-to-google-photorealistic-3d-tiles/

export const ZOOM_LEVEL_COLORS_DEBUG = [
	0x888888, // Gray
	0xffffff, // White
	0x000000, // Black
	0xff0000, // Red
	0x00ff00, // Green
	0x0000ff, // Blue
	0xffff00, // Yellow
	0xff00ff, // Magenta
	0x00ffff, // Cyan
	0x880000, // Dark Red
	0x008800, // Dark Green
	0x000088, // Dark Blue
	0x888800, // Olive
	0x880088, // Purple
	0x008888, // Teal
	0x444444, // Dark Gray
	0xff8800, // Orange
	0x88ff00, // Lime
	0x0088ff, // Sky Blue
	0xff0088, // Pink
];

export const BUILDING_FACADE_TEXTURE_URLS = [
	'sketchuptextureclub/7_wall cladding stone texture-seamless.jpg',
	'sketchuptextureclub/11_wall cladding stone texture-seamless.jpg',
	'sketchuptextureclub/25_wall cladding stone texture-seamless.jpg',
	'sketchuptextureclub/36_wall cladding stone granite texture-seamless.jpg',
	'sketchuptextureclub/80_wall cladding stone texture-seamless.jpg',
	'sketchuptextureclub/112_wall cladding stone modern architecture texture-seamless.jpg',
	'sketchuptextureclub/116_wall cladding stone modern architecture texture-seamless.jpg',
	'sketchuptextureclub/142_wall cladding stone porfido texture-seamless.jpg',
	'sketchuptextureclub/161_wall cladding stone porfido texture-seamless.jpg',
	'sketchuptextureclub/214_wall cladding flagstone porfido texture-seamless.jpg',
	'sketchuptextureclub/217_wall cladding flagstone porfido texture-seamless.jpg',
	'sketchuptextureclub/237_wall cladding stone mixed size-seamless.jpg',
	'sketchuptextureclub/265_wall cladding stone mixed size-seamless.jpg',
	'sketchuptextureclub/314_silver travertine wall cladding texture-seamless.jpg',
	'sketchuptextureclub/340_stones wall cladding texture-seamless.jpg',
];
export const BUILDING_FACADE_TEXTURE_SIZE = 1024; // [px]

export const FACADE_UP = new Vector3(0, 0, 1);
export const SWISSBUILDINGS3D_FACADE_COLOR = new Color(0.886, 0.851, 0.565); // Found empirically.

export const GOOGLE_MAPS_2D_TILES_NAMES_STYLES = [
	// Check https://mapstyle.withgoogle.com for an online helper tool.
	{
		stylers: [
			{
				visibility: 'off',
			},
		],
	},
	{
		elementType: 'geometry',
		stylers: [
			{
				color: '#ffffff',
			},
			{
				weight: 2,
			},
		],
	},
	{
		elementType: 'labels',
		stylers: [
			{
				color: '#ffffff',
			},
		],
	},
	{
		elementType: 'labels.text.stroke',
		stylers: [
			{
				color: '#000000',
			},
			{
				weight: 1,
			},
		],
	},
	{
		featureType: 'administrative.country',
		stylers: [
			{
				visibility: 'on',
			},
		],
	},
	{
		featureType: 'administrative.locality',
		elementType: 'labels',
		stylers: [
			{
				visibility: 'on',
			},
		],
	},
	{
		featureType: 'administrative.province',
		elementType: 'geometry',
		stylers: [
			{
				visibility: 'on',
			},
		],
	},
	{
		featureType: 'water',
		stylers: [
			{
				visibility: 'on',
			},
		],
	},
	{
		featureType: 'water',
		elementType: 'labels',
		stylers: [
			{
				color: '#73fdff',
			},
			{
				visibility: 'on',
			},
		],
	},
];
