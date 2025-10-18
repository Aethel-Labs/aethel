export interface RandomReddit {
  response_time_ms: number;
  source: string;
  subreddit: string;
  title: string;
  upvotes: number;
  url: string;
}

export interface WikiSearchResponse {
  batchcomplete: string;
  continue?: {
    sroffset: number;
    continue: string;
  };
  query: {
    searchinfo: {
      totalhits: number;
      suggestion?: string;
      suggestionsnippet?: string;
    };
    search: WikiSearchResult[];
  };
}

interface WikiSearchResult {
  ns: number;
  title: string;
  pageid: number;
  size: number;
  wordcount: number;
  snippet: string;
  timestamp: string;
}

export interface WikiPageResponse {
  batchcomplete: string;
  query: {
    pages: {
      [pageid: string]: WikiPage;
    };
  };
}

export interface WikiPage {
  pageid: number;
  ns: number;
  title: string;
  extract: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  pageimage?: string;
}

export interface WeatherResponse {
  coord: {
    lon: number;
    lat: number;
  };
  weather: {
    id: number;
    main: string;
    description: string;
    icon: string;
  }[];
  base: string;
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
    sea_level: number;
    grnd_level: number;
  };
  visibility: number;
  wind: {
    speed: number;
    deg: number;
    gust: number;
  };
  clouds: {
    all: number;
  };
  dt: number;
  sys: {
    country: string;
    sunrise: number;
    sunset: number;
  };
  timezone: number;
  id: number;
  name: string;
  cod: number;
}

export interface WeatherErrorResponse {
  cod: string;
  message: string;
}

export type WeatherAPIResponse = WeatherResponse | WeatherErrorResponse;
