export interface RegionGroup {
  continent: string;
  regions: string[];
}

export const GLOBAL_REGION_GROUPS: RegionGroup[] = [
  {
    continent: 'Global Multi-Region Edge',
    regions: ['global-anycast (Global Multi-Region Edge)'],
  },
  {
    continent: 'North America',
    regions: [
      'us-east-1 (Virginia, USA)',
      'us-east-2 (New York, USA)',
      'us-central-1 (Chicago, USA)',
      'us-west-1 (Oregon, USA)',
      'us-west-2 (California, USA)',
      'ca-central-1 (Toronto, Canada)',
      'mx-central-1 (Mexico City, Mexico)',
    ],
  },
  {
    continent: 'South America',
    regions: [
      'sa-east-1 (Sao Paulo, Brazil)',
      'sa-south-1 (Santiago, Chile)',
      'sa-north-1 (Bogota, Colombia)',
    ],
  },
  {
    continent: 'Europe',
    regions: [
      'eu-west-2 (London, UK)',
      'eu-west-1 (Frankfurt, Germany)',
      'eu-west-3 (Paris, France)',
      'eu-west-4 (Amsterdam, Netherlands)',
      'eu-west-5 (Dublin, Ireland)',
      'eu-south-1 (Madrid, Spain)',
      'eu-south-2 (Milan, Italy)',
      'eu-north-1 (Stockholm, Sweden)',
      'eu-central-2 (Zurich, Switzerland)',
      'eu-east-1 (Warsaw, Poland)',
    ],
  },
  {
    continent: 'Middle East & Africa',
    regions: [
      'me-central-1 (Dubai, UAE)',
      'me-south-1 (Riyadh, Saudi Arabia)',
      'me-west-1 (Tel Aviv, Israel)',
      'af-north-1 (Cairo, Egypt)',
      'af-west-1 (Lagos, Nigeria)',
      'af-east-1 (Nairobi, Kenya)',
      'af-south-1 (Johannesburg, South Africa)',
    ],
  },
  {
    continent: 'Asia-Pacific',
    regions: [
      'ap-south-1 (Mumbai, India)',
      'ap-south-2 (Bangalore, India)',
      'ap-southeast-1 (Singapore)',
      'ap-southeast-2 (Jakarta, Indonesia)',
      'ap-southeast-3 (Bangkok, Thailand)',
      'ap-east-1 (Hong Kong)',
      'ap-northeast-1 (Tokyo, Japan)',
      'ap-northeast-2 (Seoul, South Korea)',
      'ap-northeast-3 (Osaka, Japan)',
    ],
  },
  {
    continent: 'Oceania',
    regions: [
      'oc-east-1 (Sydney, Australia)',
      'oc-south-1 (Melbourne, Australia)',
      'oc-nz-1 (Auckland, New Zealand)',
    ],
  },
];

export const ALL_GLOBAL_REGIONS: string[] = GLOBAL_REGION_GROUPS.flatMap(
  (g) => g.regions
);

export const DEFAULT_REGION = 'eu-west-2 (London, UK)';

export const PREFERRED_REGION_STORAGE_KEY = 'mcloud_preferred_region';
