import { RbdBuildingData, RbdDwellingData } from '../services/rbd.service';

export interface HighlightedBuildingInfo {
	batchId: number;
	tileOffset: number;
	buildingName: string | null;
	batchData: Record<string, unknown>;
	rbdData: RbdBuildingData | null;
}

export interface BuildingDisplayRow {
	label: string;
	tooltip: string | null;
	value: string;
}

export function buildBuildingName(
	swissBuildings3d: Record<string, unknown>,
	rbd: RbdBuildingData | null
): string | null {
	// The building name is not provided by the RBD for all buildings, but when it is, it is more informative than the one from swisstopo3d (e.g. "Cathedral of Fribourg" instead of just "Fribourg"). So we use it when available.
	return str(rbd?.buildingName) ?? str(swissBuildings3d['NAME_KOMPLETT']) ?? null;
}

export function buildBuildingDisplayRows(buildingInfo: HighlightedBuildingInfo): BuildingDisplayRow[] {
	const rbdData = buildingInfo.rbdData;
	const batchData = buildingInfo.batchData;

	const rows: BuildingDisplayRow[] = [];
	const push = (label: string, tooltip: string | null, value: string | null) => {
		if (value) rows.push({ label, tooltip, value });
	};

	push('Purpose', null, str(rbdData?.category) ?? str(batchData['GEBAEUDE_NUTZUNG']) ?? null);
	push('Class', null, str(rbdData?.class) ?? translateOjektart(str(batchData['OBJEKTART'])) ?? null);

	if (rbdData?.address) {
		const locality = str(rbdData.locality) ? `${rbdData.zipCode ?? ''} ${rbdData.locality}`.trim() : null;
		const full = locality ? `${rbdData.address},<wbr> ${locality}`.trim() : rbdData.address;
		push('Address', null, full);
	}

	const lat = num(batchData['Latitude']);
	const lng = num(batchData['Longitude']);
	if (lat !== null && lng !== null) {
		push('GPS coords', null, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
	}

	const groundLevel = num(batchData['GELAENDEPUNKT']);
	push('Ground level', null, groundLevel !== null ? `${groundLevel.toFixed(2)} m` : null);

	const roofMax = num(batchData['DACH_MAX']);
	const roofMin = num(batchData['DACH_MIN']);
	if (roofMin !== null && roofMax !== null) {
		push('Roof altitude', null, `${roofMin.toFixed(2)} – ${roofMax.toFixed(2)} m`);
	} else if (roofMax !== null) {
		push('Roof ridge altitude', null, `${roofMax.toFixed(2)} m`);
	}

	const height = num(batchData['GESAMTHOEHE']) ?? num(batchData['Height']);
	push('Height', null, height !== null ? `${height.toFixed(2)} m` : null);
	if (rbdData?.area) push('Footprint', null, `${rbdData.area} m²`);
	if (rbdData?.volume) push('Volume', null, `${rbdData.volume} m³`);

	const egid = num(batchData['EGID']);
	push('EGID', null, egid !== null ? String(egid) : null);
	push('EGRID', null, str(rbdData?.egrid) ?? null);

	const built = num(rbdData?.yearBuilt) ?? str(rbdData?.periodBuilt) ?? null;
	push('Built', null, built !== null ? String(built) : null);

	const dataSourceYear = num(batchData['HERKUNFT_JAHR']);
	const dataSourceMonth = num(batchData['HERKUNFT_MONAT']);
	if (dataSourceYear !== null && dataSourceMonth !== null) {
		push('Source date', null, `${dataSourceMonth.toString().padStart(2, '0')}.${dataSourceYear}`);
	}

	push('Floors', null, num(rbdData?.floorsCount) ? String(rbdData?.floorsCount) : null);

	push('Dwellings', null, num(rbdData?.dwellingsCount) ? String(rbdData?.dwellingsCount) : null);

	return rows;
}

export function buildDwellingSummary(d: RbdDwellingData): string {
	const parts: string[] = [];
	if (d.floor) parts.push(d.floor);
	if (d.roomsCount !== null) parts.push(`${d.roomsCount} room${d.roomsCount !== 1 ? 's' : ''}`);
	if (d.floorArea !== null) parts.push(`${d.floorArea} m²`);
	//if (d.kitchen !== null) parts.push(d.kitchen ? 'kitchen' : 'no kitchen'); // Really useful?
	//if (d.yearBuilt !== null) parts.push(`built in ${d.yearBuilt}`); // Seems to be very unreliable, especially in Fribourg area where a lot of dwellings have a 1999 value which doens't match building built year.
	return parts.join(' ·<wbr> ');
}

function translateOjektart(objektart: string | null): string | null {
	if (!objektart) return null;

	switch (objektart) {
		case 'Bruecke gedeckt':
			return 'Covered bridge';
		case 'Gebaeude Einzelhaus':
			return 'Single-family house';
		case 'Hochhaus':
			return 'High-rise';
		case 'Hochkamin':
			return 'High chimney';
		case 'Turm':
			return 'Tower';
		case 'Kuehlturm':
			return 'Cooling tower';
		case 'Lagertank':
			return 'Storage tank';
		case 'Lueftungsschacht':
			return 'Ventilation shaft';
		case 'Offenes Gebaeude':
			return 'Open building';
		case 'Treibhaus':
			return 'Greenhouse';
		case 'Im Bau':
			return 'Under construction';
		case 'Kapelle':
			return 'Chapel';
		case 'Sakraler Turm':
			return 'Sacred tower';
		case 'Sakrales Gebaeude':
			return 'Sacred building';
		case 'Flugdach':
			return 'Flying roof';
		case 'Unterirdisches Gebaeude':
			return 'Underground building';
		case 'Mauer gross':
			return 'Large wall';
		case 'Mauer gross gedeckt':
			return 'Large covered wall';
		case 'Historische Baute':
			return 'Historical building';
		default:
			return null;
	}
}

function num(value: unknown): number | null {
	return typeof value === 'number' && !isNaN(value) ? value : null;
}

function str(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}
