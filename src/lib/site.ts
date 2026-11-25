export const REPO = 'https://github.com/planckdotgg/planck';
export const RELEASES = `${REPO}/releases`;
export const ISSUES = `${REPO}/issues`;
export const LICENSE_URL = `${REPO}/blob/main/LICENSE`;
export const CONTACT = 'hello@planck.gg';
export const GO_VERSION = 'Go 1.27.4+';

export const BUILD_POSIX = [
	'git clone https://github.com/planckdotgg/planck.git',
	'cd planck && mkdir -p bin',
	'CGO_ENABLED=0 go build -o bin/ ./cmd/planck-host ./cmd/planck-client',
];

export const BUILD_POWERSHELL = [
	'git clone https://github.com/planckdotgg/planck.git',
	'cd planck; New-Item -ItemType Directory -Force bin | Out-Null',
	'$env:CGO_ENABLED="0"; go build -o bin\\ ./cmd/planck-host ./cmd/planck-client',
];

/** The phone layout splits the build line in two so nothing scrolls sideways. */
export const BUILD_POSIX_SHORT = [
	'git clone https://github.com/planckdotgg/planck.git',
	'cd planck && mkdir -p bin',
	'CGO_ENABLED=0 go build -o bin/ ./cmd/planck-host',
	'CGO_ENABLED=0 go build -o bin/ ./cmd/planck-client',
];
