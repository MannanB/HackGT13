import { blobPolygon } from '@/utils/geo'
import type { ResidentialZone } from '@/types/geography'

function zone(
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  radiusKm: number,
  seed: number,
  population: number,
  primaryStationId: string,
  transferStationIds: string[],
): ResidentialZone {
  return {
    id,
    name,
    geometry: blobPolygon(latitude, longitude, radiusKm, seed),
    centroid: { latitude, longitude },
    population,
    primaryStationId,
    transferStationIds,
  }
}

export const mockZones: ResidentialZone[] = [
  zone('west-end', 'West End', 33.7358, -84.421, 1.15, 1.2, 4820, 'WEST_END', ['FIVE_POINTS', 'ASHBY']),
  zone('mechanicsville', 'Mechanicsville', 33.7422, -84.3978, 0.72, 2.1, 3180, 'GARNETT', ['FIVE_POINTS']),
  zone('adair-park', 'Adair Park', 33.7304, -84.4108, 0.78, 0.6, 2740, 'WEST_END', ['FIVE_POINTS']),
  zone('east-atlanta', 'East Atlanta', 33.7376, -84.3472, 1.05, 3.4, 3920, 'INMAN_PARK', ['KING_MEMORIAL', 'FIVE_POINTS']),
  zone('grant-park', 'Grant Park', 33.7358, -84.3732, 0.9, 4.1, 4100, 'KING_MEMORIAL', ['GEORGIA_STATE']),
  zone('downtown', 'Downtown', 33.7554, -84.3902, 0.7, 1.8, 2650, 'FIVE_POINTS', ['PEACHTREE_CENTER', 'GEORGIA_STATE']),
  zone('vine-city', 'Vine City', 33.7588, -84.4128, 0.82, 2.7, 3360, 'VINE_CITY', ['FIVE_POINTS', 'ASHBY']),
  zone('capitol-view', 'Capitol View', 33.7226, -84.4074, 0.85, 5.2, 2980, 'OAKLAND_CITY', ['WEST_END', 'FIVE_POINTS']),
  zone('peoplestown', 'Peoplestown', 33.7316, -84.3854, 0.7, 0.9, 2410, 'GARNETT', ['KING_MEMORIAL']),
  zone('old-fourth-ward', 'Old Fourth Ward', 33.7638, -84.3718, 0.88, 6.3, 4540, 'KING_MEMORIAL', ['NORTH_AVENUE']),
  zone('inman-park', 'Inman Park', 33.7616, -84.3524, 0.76, 1.4, 3210, 'INMAN_PARK', ['EDGEWOOD']),
  zone('east-lake', 'East Lake', 33.7432, -84.3126, 1.05, 2.9, 3680, 'EAST_LAKE', ['DECATUR']),
  zone('midtown', 'Midtown', 33.7846, -84.3842, 0.95, 3.7, 6120, 'MIDTOWN', ['NORTH_AVENUE', 'ARTS_CENTER']),
  zone('virginia-highland', 'Virginia-Highland', 33.7824, -84.3546, 0.92, 4.8, 3890, 'ARTS_CENTER', ['NORTH_AVENUE']),
  zone('west-midtown', 'West Midtown', 33.7872, -84.4126, 1.1, 0.4, 4470, 'ARTS_CENTER', ['MIDTOWN']),
  zone('oakland-city', 'Oakland City', 33.7164, -84.4258, 0.86, 5.6, 3520, 'OAKLAND_CITY', ['WEST_END']),
  zone('east-point', 'East Point', 33.6796, -84.4392, 1.2, 2.2, 5210, 'EAST_POINT', ['COLLEGE_PARK']),
  zone('grant-park-east', 'Cabbagetown', 33.7496, -84.3654, 0.62, 7.1, 1980, 'KING_MEMORIAL', ['INMAN_PARK']),
]
