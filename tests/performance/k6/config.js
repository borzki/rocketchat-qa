// Shared configuration for k6 performance scenarios.
// Base URL defaults to the Rocket.Chat instance running in docker-compose.
// When executed inside the grafana/k6 container, use host.docker.internal
// so the container can reach the host network.
export const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:3000';
export const USERNAME = __ENV.RC_USERNAME || 'admin';
export const PASSWORD = __ENV.RC_PASSWORD || 'AdminPass123!@#';

export const thresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<800'],
  iteration_duration: ['p(95)<2000'],
};
