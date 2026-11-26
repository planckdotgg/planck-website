export const REPO = 'https://github.com/planckdotgg/planck';
export const RELEASES = `${REPO}/releases`;
export const ISSUES = `${REPO}/issues`;
export const LICENSE_URL = `${REPO}/blob/main/LICENSE`;
export const DOCS = `${REPO}#readme`;
export const ARCHITECTURE = `${REPO}/tree/main/docs`;
export const PROTOCOL = `${REPO}/tree/main/pkg/wire`;
export const BENCHMARKS = `${REPO}/tree/main/docs/perf`;

export const BUILD_POSIX =
	'git clone https://github.com/planckdotgg/planck.git && cd planck && go build -o ./bin/ ./cmd/planck-host ./cmd/planck-client';
export const BUILD_POWERSHELL =
	'git clone https://github.com/planckdotgg/planck.git; cd planck; go build -o .\\bin\\ ./cmd/planck-host ./cmd/planck-client';
