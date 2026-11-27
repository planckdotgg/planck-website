export const REPO = 'https://github.com/planckdotgg/planck';
export const RELEASES = `${REPO}/releases`;
export const ISSUES = `${REPO}/issues`;
export const LICENSE_URL = `${REPO}/blob/main/LICENSE`;

export const DOCS = '/docs';
export const ARCHITECTURE = '/docs/architecture';
export const PROTOCOL = '/docs/protocol';
export const BENCHMARKS = '/docs/benchmarks';
export const CONFIGURATION = '/docs/configuration';
export const PRIVACY = '/docs/privacy';
export const TROUBLESHOOTING = '/docs/troubleshooting';

/** A file in the planck repo at main; docs pages cite the file they are derived from. */
export const BLOB = (path: string) => `${REPO}/blob/main/${path}`;

/** The release the docs describe. Every number on a docs page was checked against this commit. */
export const VERSION = '0.2.0';
export const COMMIT = '6749346';

/** Historical benchmark provenance: the figures in the docs were measured at this release. */
export const BENCHMARK_VERSION = '0.1.0';
export const BENCHMARK_COMMIT = '8a3c732';

export const BUILD_POSIX =
	'git clone https://github.com/planckdotgg/planck.git && cd planck && go build -o ./bin/ ./cmd/planck-host ./cmd/planck-client';
export const BUILD_POWERSHELL =
	'git clone https://github.com/planckdotgg/planck.git; cd planck; go build -o .\\bin\\ ./cmd/planck-host ./cmd/planck-client';
