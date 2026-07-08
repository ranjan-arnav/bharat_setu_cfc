import type { NextRequest } from 'next/server';

type AppInsightsModule = typeof import('applicationinsights');
type AppInsightsClient = import('applicationinsights').TelemetryClient;

type TelemetryValue = string | number | boolean | null | undefined;
type TelemetryProperties = Record<string, TelemetryValue>;
type TelemetryMeasurements = Record<string, number>;

let initialized = false;
let initializationAttempted = false;
let appInsightsModule: AppInsightsModule | null | undefined;

function loadAppInsights(): AppInsightsModule | null {
  if (appInsightsModule !== undefined) {
    return appInsightsModule;
  }

  try {
    const runtimeRequire = (0, eval)('require') as NodeJS.Require;
    appInsightsModule = runtimeRequire('applicationinsights') as AppInsightsModule;
    return appInsightsModule;
  } catch {
    appInsightsModule = null;
    return null;
  }
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeProperties(input?: TelemetryProperties): Record<string, string> {
  if (!input) return {};
  return Object.entries(input).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = typeof value === 'string' ? value : String(value);
    }
    return acc;
  }, {});
}

function getClient(): AppInsightsClient | null {
  const appInsights = loadAppInsights();
  if (!appInsights) {
    return null;
  }

  if (initialized) {
    return appInsights.defaultClient ?? null;
  }

  if (initializationAttempted) {
    return null;
  }

  initializationAttempted = true;

  const connectionString =
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim() ||
    process.env.APPINSIGHTS_CONNECTIONSTRING?.trim() ||
    '';

  if (!connectionString) {
    return null;
  }

  try {
    const samplingPercentage = clamp(
      parseNumber(process.env.APPINSIGHTS_SAMPLING_PERCENTAGE, 30),
      1,
      100
    );
    const autoCollectDependencies =
      (process.env.APPINSIGHTS_AUTOCOLLECT_DEPENDENCIES || 'false').toLowerCase() === 'true';
    const autoCollectRequests =
      (process.env.APPINSIGHTS_AUTOCOLLECT_REQUESTS || 'false').toLowerCase() === 'true';

    appInsights
      .setup(connectionString)
      .setAutoCollectRequests(autoCollectRequests)
      .setAutoCollectDependencies(autoCollectDependencies)
      .setAutoCollectExceptions(false)
      .setAutoCollectPerformance(true, false)
      .setAutoDependencyCorrelation(true)
      .setInternalLogging(false, false)
      .setSendLiveMetrics(false)
      .setUseDiskRetryCaching(true)
      .start();

    const client = appInsights.defaultClient;
    if (client) {
      const roleName = process.env.APPINSIGHTS_ROLE_NAME?.trim() || 'bharat-setu-api';
      client.context.tags[client.context.keys.cloudRole] = roleName;
      client.config.samplingPercentage = samplingPercentage;
      initialized = true;
      return client;
    }

    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[Telemetry] Application Insights initialization failed:', errorMessage);
    return null;
  }
}

export function startRouteTelemetry(
  request: NextRequest,
  routeName: string,
  initialProperties?: TelemetryProperties
) {
  const startedAt = Date.now();
  const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
  const client = getClient();

  let properties = {
    route: routeName,
    method: request.method,
    path: request.nextUrl.pathname,
    correlationId,
    ...normalizeProperties(initialProperties),
  };

  const trackEvent = (
    name: string,
    eventProperties?: TelemetryProperties,
    measurements?: TelemetryMeasurements
  ) => {
    client?.trackEvent({
      name,
      properties: {
        ...properties,
        ...normalizeProperties(eventProperties),
      },
      measurements,
    });
  };

  return {
    correlationId,
    setContext(extraProperties: TelemetryProperties) {
      properties = {
        ...properties,
        ...normalizeProperties(extraProperties),
      };
    },
    trackEvent,
    complete(statusCode: number, extraProperties?: TelemetryProperties) {
      const durationMs = Date.now() - startedAt;
      const success = statusCode < 400;

      const finalProperties = {
        ...properties,
        statusCode: String(statusCode),
        success: String(success),
        ...normalizeProperties(extraProperties),
      };

      client?.trackRequest({
        name: routeName,
        url: request.nextUrl.pathname,
        duration: durationMs,
        resultCode: String(statusCode),
        success,
        time: new Date(startedAt),
        properties: finalProperties,
      });

      client?.trackMetric({
        name: `${routeName}.duration_ms`,
        value: durationMs,
        properties: finalProperties,
      });
    },
    fail(error: unknown, statusCode = 500, extraProperties?: TelemetryProperties) {
      const durationMs = Date.now() - startedAt;
      const finalProperties = {
        ...properties,
        statusCode: String(statusCode),
        ...normalizeProperties(extraProperties),
      };

      client?.trackException({
        exception: error instanceof Error ? error : new Error(String(error)),
        properties: finalProperties,
      });

      client?.trackRequest({
        name: routeName,
        url: request.nextUrl.pathname,
        duration: durationMs,
        resultCode: String(statusCode),
        success: false,
        time: new Date(startedAt),
        properties: finalProperties,
      });

      client?.trackMetric({
        name: `${routeName}.duration_ms`,
        value: durationMs,
        properties: {
          ...finalProperties,
          success: 'false',
        },
      });
    },
  };
}

export function trackBackendOperation(
  operationName: string,
  durationMs: number,
  success: boolean,
  properties?: TelemetryProperties,
  error?: unknown
) {
  const client = getClient();
  if (!client) return;

  const normalizedProps = {
    operationName,
    success: String(success),
    ...normalizeProperties(properties),
  };

  client.trackEvent({
    name: 'backend.operation',
    properties: normalizedProps,
    measurements: { durationMs },
  });

  client.trackMetric({
    name: `backend.${operationName}.duration_ms`,
    value: durationMs,
    properties: normalizedProps,
  });

  if (!success && error) {
    client.trackException({
      exception: error instanceof Error ? error : new Error(String(error)),
      properties: normalizedProps,
    });
  }
}
