import { Injectable } from '@angular/core';

export interface RbdBuildingData {
	buildingName: string | null;
	address: string | null;
	zipCode: number | null;
	locality: string | null;
	canton: string | null;
	yearBuilt: number | null;
	periodBuilt: string | null;
	floorsCount: number | null;
	dwellingsCount: number | null;
	area: number | null;
	volume: number | null;
	egrid: string | null;
	category: string | null;
	class: string | null;
	dwellings: RbdDwellingData[] | null;
}

export interface RbdDwellingData {
	ewid: string | null;
	floor: string | null;
	roomsCount: number | null;
	floorArea: number | null;
	yearBuilt: number | null;
	kitchen: boolean | null;
}

interface RbdRawBuildingResponse {
	gbez: string | null;
	strname_deinr: string | null;
	dplz4: number | null;
	dplzname: string | null;
	gdekt: string | null;
	gbauj: number | null;
	gbaup: number | null;
	gastw: number | null;
	ganzwhg: number | null;
	garea: number | null;
	gvol: number | null;
	egrid: string | null;
	gkat: number | null;
	gklas: number | null;
	ewid: string[] | null;
	wstwk: number[] | null;
	wazim: number[] | null;
	warea: number[] | null;
	wbauj: number[] | null;
	wkche: number[] | null;
}

const RBD_FIND_BY_EGID_URL =
	'https://api3.geo.admin.ch/rest/services/api/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&returnGeometry=false&searchText=';

// RBD codes from https://www.housing-stat.ch/catalog/en/4.3/final
const GSTAT_CODES: Record<number, string> = {
	1001: 'Planned',
	1002: 'Authorised',
	1003: 'Under construction',
	1004: 'Existing',
	1005: 'Disused',
	1007: 'Demolished',
	1008: 'Not realised',
};
const GKAT_CODES: Record<number, string> = {
	1010: 'Temporary accommodation',
	1020: 'Building for residential use only',
	1030: 'Other residential building (with subsidiary use)',
	1040: 'Building with partial residential use',
	1060: 'Non-residential building',
	1080: 'Special construction',
};
const GKLAS_CODES: Record<number, string> = {
	1110: 'Single-dwelling buildings',
	1121: 'Two-dwelling buildings',
	1122: 'Three- and more dwelling building',
	1130: 'Community residence',
	1211: 'Hotels',
	1212: 'Other short-stay accommodation buildings',
	1220: 'Office buildings',
	1230: 'Wholesale and retail trade buildings',
	1231: 'Restaurants and bars in non-residential buildings',
	1241: 'Rail stations, air terminals, telephone exchange buildings',
	1242: 'Garage buildings',
	1251: 'Industrial buildings',
	1252: 'Reservoirs, silos and warehouses',
	1261: 'Buildings for cultural, recreational, educational or health purposes',
	1262: 'Museums and libraries',
	1263: 'School, university and research buildings',
	1264: 'Hospital or institutional care buildings',
	1265: 'Sports halls',
	1271: 'Agricultural buildings',
	1272: 'Buildings used as places of worship and for religious activities',
	1273: 'Historic or protected monuments',
	1274: 'Other buildings not elsewhere classified',
	1275: 'Other buildings for collective households',
	1276: 'Buildings for keeping animals',
	1277: 'Buildings for growing crops',
	1278: 'Other non-residential agricultural buildings',
};
const GWAERZH_CODES: Record<number, string> = {
	7400: 'No heat generator',
	7410: 'PAC heat pump for a single building',
	7411: 'PAC heat pump for several buildings',
	7420: 'Thermic solar facility for a single building',
	7421: 'Thermic solar facility for several buildings',
	7430: 'Boiler (generic) for a single building',
	7431: 'Boiler (generic) for several buildings',
	7432: 'Standard boiler for a single building',
	7433: 'Standard boiler for several buildings',
	7434: 'Condensing boiler for a single building',
	7435: 'Condensing boiler for several buildings',
	7436: 'Stove heating',
	7440: 'Combined heat and power system for a single building',
	7441: 'Combined heat and power system for several buildings',
	7450: 'Electric central heating for a single building',
	7451: 'Electric central heating for several buildings',
	7452: 'Direct electric heating (including infra-red heaters)',
	7460: 'Heat exchanger (including for district heating) for a single building',
	7461: 'Heat exchanger (including for district heating) for several buildings',
	7499: 'Other',
};
const GENH_CODES: Record<number, string> = {
	7500: 'None',
	7501: 'Air',
	7510: 'Geothermal energy (generic)',
	7511: 'Geothermal probe',
	7512: 'Geothermal loop',
	7513: 'Water (groundwater, surface water, waste water)',
	7520: 'Gas',
	7530: 'Heating oil',
	7540: 'Wood (generic)',
	7541: 'Wood (logs)',
	7542: 'Wood (pellets)',
	7543: 'Wood (shredded wood, wood chips)',
	7550: 'Heat emissions (in building)',
	7560: 'Electricity',
	7570: 'Solar (thermal)',
	7580: 'District heating (generic)',
	7581: 'District heating (high temperature)',
	7582: 'District heating (low temperature)',
	7598: 'Indeterminable',
	7599: 'Other',
};
const GBAUP_CODES: Record<number, string> = {
	8011: 'Before 1919',
	8012: '1919 - 1945',
	8013: '1946 - 1960',
	8014: '1961 - 1970',
	8015: '1971 - 1980',
	8016: '1981 - 1985',
	8017: '1986 - 1990',
	8018: '1991 - 1995',
	8019: '1996 - 2000',
	8020: '2001 - 2005',
	8021: '2006 - 2010',
	8022: '2011 - 2015',
	8023: 'After 2016',
};

// Register of Buildings and Dwellings (https://www.housing-stat.ch)
@Injectable({ providedIn: 'root' })
export class RbdService {
	private cache = new Map<number, RbdBuildingData>();
	private pending = new Map<number, Promise<RbdBuildingData | null>>();

	async fetchByEgid(egid: number): Promise<RbdBuildingData | null> {
		const cached = this.cache.get(egid);
		if (cached) return cached;

		const inflight = this.pending.get(egid);
		if (inflight) return inflight;

		const promise = this.doFetch(egid);
		this.pending.set(egid, promise);

		try {
			const result = await promise;
			if (result) {
				this.cache.set(egid, result);
			}
			return result;
		} finally {
			this.pending.delete(egid);
		}
	}

	private async doFetch(egid: number): Promise<RbdBuildingData | null> {
		try {
			const response = await fetch(`${RBD_FIND_BY_EGID_URL}${encodeURIComponent(egid)}`);
			if (!response.ok) return null;

			const results = (await response.json())?.results;
			if (!Array.isArray(results) || results.length === 0) return null;

			return this.parseRbdResponse(results[0].attributes as RbdRawBuildingResponse);
		} catch {
			return null;
		}
	}

	private parseRbdResponse(attrs: RbdRawBuildingResponse): RbdBuildingData {
		const result = {
			buildingName: attrs['gbez'],
			address: attrs['strname_deinr'],
			zipCode: attrs['dplz4'],
			locality: attrs['dplzname'],
			canton: attrs['gdekt'],
			yearBuilt: attrs['gbauj'],
			periodBuilt: attrs['gbaup'] ? GBAUP_CODES[attrs['gbaup']] : null,
			floorsCount: attrs['gastw'],
			dwellingsCount: attrs['ganzwhg'],
			area: attrs['garea'],
			volume: attrs['gvol'],
			egrid: attrs['egrid'],
			category: attrs['gkat'] ? GKAT_CODES[attrs['gkat']] : null,
			class: attrs['gklas'] ? GKLAS_CODES[attrs['gklas']] : null,
			dwellings: this.parseDwellings(attrs),
		};

		return result;
	}

	private parseDwellings(attrs: RbdRawBuildingResponse): RbdDwellingData[] | null {
		let ewid: string[];
		let wstwk: number[];
		let wazim: number[];
		let warea: number[];
		let wbauj: number[];
		let wkche: number[];

		const rawDwellingsAttrs = [
			attrs['ewid'],
			attrs['wstwk'],
			attrs['wazim'],
			attrs['warea'],
			attrs['wbauj'],
			attrs['wkche'],
		];
		if (
			rawDwellingsAttrs.every((arr): arr is string[] | number[] => arr !== null) &&
			new Set(rawDwellingsAttrs.map(arr => arr.length)).size === 1
		) {
			ewid = attrs['ewid'] as string[];
			wstwk = attrs['wstwk'] as number[];
			wazim = attrs['wazim'] as number[];
			warea = attrs['warea'] as number[];
			wbauj = attrs['wbauj'] as number[];
			wkche = attrs['wkche'] as number[];
		} else {
			// Either some dwelling attributes are missing or they don't have the same length, so we can't reliably parse them
			return null;
		}

		const dwellings: RbdDwellingData[] = [];
		for (let i = 0; i < ewid.length; i++) {
			const floorCode = wstwk[i];
			let floor: string | null = null;
			if (floorCode === 3100) {
				floor = 'Ground floor';
			} else if (floorCode === 3101) {
				floor = '1st floor';
			} else if (floorCode === 3102) {
				floor = '2nd floor';
			} else if (floorCode === 3103) {
				floor = '3rd floor';
			} else if (floorCode >= 3104 && floorCode <= 3199) {
				floor = `${floorCode - 3100}th floor`;
			} else if (floorCode === 3401) {
				floor = '1st basement level';
			} else if (floorCode === 3402) {
				floor = '2nd basement level';
			} else if (floorCode === 3403) {
				floor = '3rd basement level';
			} else if (floorCode >= 3404 && floorCode <= 3419) {
				floor = `${floorCode - 3400}th basement level`;
			}

			dwellings.push({
				ewid: ewid[i],
				floor,
				roomsCount: wazim[i],
				floorArea: warea[i],
				yearBuilt: wbauj[i],
				kitchen: wkche[i] === 1,
			});
		}

		return dwellings.length > 0 ? dwellings : null;
	}
}
