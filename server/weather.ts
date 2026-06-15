type GeocodingResponse = {
  results?: Array<{
    name?: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
  }>;
};

type ForecastResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
};

export type WeatherContext = {
  locationName: string;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  condition: string;
  summary: string;
};

const GEOCODING_BASE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_BASE_URL = "https://api.open-meteo.com/v1/forecast";

const districtAliases: Array<{ pattern: RegExp; query: string }> = [
  { pattern: /土城/, query: "Tucheng District, New Taipei City, Taiwan" },
  { pattern: /板橋/, query: "Banqiao District, New Taipei City, Taiwan" },
  { pattern: /新莊/, query: "Xinzhuang District, New Taipei City, Taiwan" },
  { pattern: /中和/, query: "Zhonghe District, New Taipei City, Taiwan" },
  { pattern: /永和/, query: "Yonghe District, New Taipei City, Taiwan" },
  { pattern: /三重/, query: "Sanchong District, New Taipei City, Taiwan" },
  { pattern: /台北|臺北/, query: "Taipei, Taiwan" },
  { pattern: /新北/, query: "New Taipei City, Taiwan" },
  { pattern: /桃園/, query: "Taoyuan, Taiwan" },
  { pattern: /台中|臺中/, query: "Taichung, Taiwan" },
  { pattern: /台南|臺南/, query: "Tainan, Taiwan" },
  { pattern: /高雄/, query: "Kaohsiung, Taiwan" },
  { pattern: /基隆/, query: "Keelung, Taiwan" },
  { pattern: /新竹/, query: "Hsinchu, Taiwan" },
  { pattern: /苗栗/, query: "Miaoli, Taiwan" },
  { pattern: /彰化/, query: "Changhua, Taiwan" },
  { pattern: /南投/, query: "Nantou, Taiwan" },
  { pattern: /雲林/, query: "Yunlin, Taiwan" },
  { pattern: /嘉義/, query: "Chiayi, Taiwan" },
  { pattern: /屏東/, query: "Pingtung, Taiwan" },
  { pattern: /宜蘭/, query: "Yilan, Taiwan" },
  { pattern: /花蓮/, query: "Hualien, Taiwan" },
  { pattern: /台東|臺東/, query: "Taitung, Taiwan" },
  { pattern: /澎湖/, query: "Penghu, Taiwan" },
  { pattern: /金門/, query: "Kinmen, Taiwan" },
  { pattern: /連江|馬祖/, query: "Matsu Islands, Taiwan" },
];

function isWeatherContextEnabled(): boolean {
  return process.env.WEATHER_CONTEXT_ENABLED !== "false";
}

function getWeatherCondition(code: number | undefined): string {
  if (code === undefined) return "天氣狀況不明";
  if (code === 0) return "晴朗";
  if ([1, 2].includes(code)) return "晴時多雲";
  if (code === 3) return "多雲";
  if ([45, 48].includes(code)) return "有霧";
  if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "下雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "降雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "天氣變化較明顯";
}

function normalizeAddressForWeather(address: string): string {
  const trimmed = address.trim();
  const alias = districtAliases.find(item => item.pattern.test(trimmed));
  if (alias) return alias.query;
  return `${trimmed} Taiwan`;
}

function formatLocationName(result: NonNullable<GeocodingResponse["results"]>[number]): string {
  return [result.admin1, result.name, result.country].filter(Boolean).join(" ");
}

function buildWeatherSummary(context: Omit<WeatherContext, "summary">): string {
  const tempText = context.temperatureC === null ? "氣溫未知" : `${Math.round(context.temperatureC)}°C`;
  const apparentText = context.apparentTemperatureC === null
    ? ""
    : `，體感約 ${Math.round(context.apparentTemperatureC)}°C`;
  const humidityText = context.humidityPercent === null
    ? ""
    : `，濕度約 ${Math.round(context.humidityPercent)}%`;
  const rainText = context.precipitationMm && context.precipitationMm > 0
    ? `，目前有降雨 ${context.precipitationMm}mm`
    : "";
  const windText = context.windSpeedKmh && context.windSpeedKmh >= 20
    ? `，風速較明顯約 ${Math.round(context.windSpeedKmh)} km/h`
    : "";

  return `${context.locationName}目前${context.condition}，氣溫約 ${tempText}${apparentText}${humidityText}${rainText}${windText}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getWeatherContextForAddress(address: string): Promise<WeatherContext | null> {
  if (!isWeatherContextEnabled()) return null;
  const query = normalizeAddressForWeather(address);

  try {
    const geocodingUrl = new URL(GEOCODING_BASE_URL);
    geocodingUrl.searchParams.set("name", query);
    geocodingUrl.searchParams.set("count", "1");
    geocodingUrl.searchParams.set("language", "zh");
    geocodingUrl.searchParams.set("format", "json");

    const geocoding = await fetchJson<GeocodingResponse>(geocodingUrl.toString());
    const location = geocoding.results?.[0];
    if (!location) return null;

    const forecastUrl = new URL(FORECAST_BASE_URL);
    forecastUrl.searchParams.set("latitude", String(location.latitude));
    forecastUrl.searchParams.set("longitude", String(location.longitude));
    forecastUrl.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m"
    );
    forecastUrl.searchParams.set("timezone", "Asia/Taipei");

    const forecast = await fetchJson<ForecastResponse>(forecastUrl.toString());
    const current = forecast.current;
    if (!current) return null;

    const contextWithoutSummary = {
      locationName: formatLocationName(location) || query,
      temperatureC: current.temperature_2m ?? null,
      apparentTemperatureC: current.apparent_temperature ?? null,
      humidityPercent: current.relative_humidity_2m ?? null,
      precipitationMm: current.precipitation ?? null,
      windSpeedKmh: current.wind_speed_10m ?? null,
      condition: getWeatherCondition(current.weather_code),
    };

    return {
      ...contextWithoutSummary,
      summary: buildWeatherSummary(contextWithoutSummary),
    };
  } catch (error) {
    console.warn("[Weather] Failed to load weather context:", error);
    return null;
  }
}
