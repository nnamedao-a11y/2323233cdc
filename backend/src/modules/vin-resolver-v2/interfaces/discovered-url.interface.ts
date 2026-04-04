export interface DiscoveredUrl {
  url: string;
  domain: string;
  sourceName: string;
  parserKind: 'google' | 'search_form' | 'html_detail' | 'json_api' | 'nhtsa';
  priority: number;
  tier: 1 | 2 | 3 | 4;
}
