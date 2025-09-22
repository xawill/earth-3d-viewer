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
