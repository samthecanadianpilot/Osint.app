// Seed track data for OSINT Central.
// Mock now (Phase 1); the shape matches what real ADS-B / AIS / TLE feeds
// will provide later (Phase 7), so swapping sources won't change the API.

export const LAYER_COLORS = {
  aircraft: '#ff9f0a', // amber
  ship: '#0071e3',     // blue
  satellite: '#34c759',// green
  cctv: '#ff3b30',     // red
};

// [lng, lat] city anchors used for routes
const CITY = {
  JFK: [-73.7781, 40.6413], LHR: [-0.4543, 51.4700], DXB: [55.3644, 25.2532],
  SIN: [103.9915, 1.3592], LAX: [-118.4085, 33.9416], HND: [139.7798, 35.5494],
  FRA: [8.5622, 50.0379], GRU: [-46.4731, -23.4356], SYD: [151.1772, -33.9399],
  CPT: [18.6017, -33.9715], HKG: [113.9185, 22.3080], IST: [28.8146, 40.9769],
};

export const aircraft = [
  { id: 'AC-UAL88',  callsign: 'UAL88',  registration: 'N2748U', type: 'B789',
    from: 'SFO', to: 'FRA', route: [[-122.375, 37.619], CITY.FRA],
    lat: 52.1, lng: -25.4, altitude: 38000, speed: 488, heading: 64,
    squawk: '2156', source: 'ADS-B' },
  { id: 'AC-BAW117', callsign: 'BAW117', registration: 'G-XLEB', type: 'A35K',
    from: 'LHR', to: 'JFK', route: [CITY.LHR, CITY.JFK],
    lat: 50.9, lng: -28.2, altitude: 36000, speed: 502, heading: 281,
    squawk: '5471', source: 'ADS-B' },
  { id: 'AC-UAE9',   callsign: 'UAE9',   registration: 'A6-EUW', type: 'A388',
    from: 'DXB', to: 'LHR', route: [CITY.DXB, CITY.LHR],
    lat: 38.4, lng: 24.7, altitude: 41000, speed: 515, heading: 308,
    squawk: '1342', source: 'ADS-B' },
  { id: 'AC-SIA322', callsign: 'SIA322', registration: '9V-SKU', type: 'A388',
    from: 'SIN', to: 'LHR', route: [CITY.SIN, CITY.LHR],
    lat: 27.6, lng: 62.3, altitude: 40000, speed: 506, heading: 301,
    squawk: '3705', source: 'ADS-B' },
  { id: 'AC-QFA11',  callsign: 'QFA11',  registration: 'VH-OQK', type: 'A388',
    from: 'SYD', to: 'LAX', route: [CITY.SYD, CITY.LAX],
    lat: -8.2, lng: -158.9, altitude: 39000, speed: 497, heading: 58,
    squawk: '4126', source: 'ADS-B' },
  { id: 'AC-JAL44',  callsign: 'JAL44',  registration: 'JA866J', type: 'B788',
    from: 'HND', to: 'FRA', route: [CITY.HND, CITY.FRA],
    lat: 61.4, lng: 88.1, altitude: 37000, speed: 472, heading: 318,
    squawk: '6053', source: 'ADS-B' },
];

export const ships = [
  { id: 'SH-9387261', name: 'MAERSK SELETAR', mmsi: '566123000', type: 'Container',
    from: 'SIN', to: 'DXB', route: [CITY.SIN, CITY.DXB],
    lat: 6.9, lng: 78.4, speed: 18.4, heading: 292, draught: 14.2,
    destination: 'JEBEL ALI', source: 'AIS' },
  { id: 'SH-7712044', name: 'FRONT EAGLE', mmsi: '636092810', type: 'Crude Tanker',
    from: 'DXB', to: 'CPT', route: [CITY.DXB, CITY.CPT],
    lat: 12.1, lng: 56.8, speed: 13.1, heading: 211, draught: 21.7,
    destination: 'CAPE TOWN', source: 'AIS' },
  { id: 'SH-9450912', name: 'EVER GIVEN', mmsi: '353136000', type: 'Container',
    from: 'GRU', to: 'IST', route: [CITY.GRU, CITY.IST],
    lat: 14.6, lng: -34.2, speed: 21.0, heading: 41, draught: 15.7,
    destination: 'AMBARLI', source: 'AIS' },
];

export const satellites = [
  { id: 'ST-25544', name: 'ISS (ZARYA)', noradId: 25544,
    lat: 12.4, lng: -54.1, altitude: 418, velocity: 7.66,
    inclination: 51.6, period: 92.9, source: 'TLE' },
  { id: 'ST-43013', name: 'NOAA-20',     noradId: 43013,
    lat: -22.8, lng: 110.6, altitude: 824, velocity: 7.44,
    inclination: 98.7, period: 101.4, source: 'TLE' },
  { id: 'ST-48274', name: 'STARLINK-2305', noradId: 48274,
    lat: 41.2, lng: 8.9, altitude: 550, velocity: 7.59,
    inclination: 53.0, period: 95.6, source: 'TLE' },
];

export const cctv = [
  { id: 'CV-LDN-01', name: 'Trafalgar Sq Cam', lat: 51.5080, lng: -0.1281,
    status: 'ONLINE', resolution: '1080p', source: 'STATIC' },
  { id: 'CV-NYC-04', name: 'Times Sq Cam',     lat: 40.7580, lng: -73.9855,
    status: 'ONLINE', resolution: '4K', source: 'STATIC' },
  { id: 'CV-TKY-02', name: 'Shibuya Cross Cam', lat: 35.6595, lng: 139.7005,
    status: 'DEGRADED', resolution: '720p', source: 'STATIC' },
];
