// Minimal great-circle helpers for moving tracks across the globe.
const R = 6371; // km
const toRad = d => (d * Math.PI) / 180;
const toDeg = r => (r * 180) / Math.PI;

// Advance a [lat,lng] point `distanceKm` along a compass `bearing` (deg).
export function movePoint(lat, lng, bearingDeg, distanceKm) {
  const ad = distanceKm / R;
  const br = toRad(bearingDeg);
  const la1 = toRad(lat);
  const lo1 = toRad(lng);

  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(ad) + Math.cos(la1) * Math.sin(ad) * Math.cos(br)
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(br) * Math.sin(ad) * Math.cos(la1),
      Math.cos(ad) - Math.sin(la1) * Math.sin(la2)
    );

  return {
    lat: toDeg(la2),
    lng: (((toDeg(lo2) + 540) % 360) - 180), // normalize to [-180,180]
  };
}

// Initial bearing from point A to point B (both [lat,lng]).
export function bearing(latA, lngA, latB, lngB) {
  const la1 = toRad(latA), la2 = toRad(latB);
  const dLng = toRad(lngB - lngA);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export const KTS_TO_KMH = 1.852;
