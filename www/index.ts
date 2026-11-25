/**
 * A second, very small Worker for www.planck.gg. It sends each request to the same path on
 * planck.gg, so the site has one address.
 */
export default {
	fetch(request: Request): Response {
		const url = new URL(request.url);
		url.protocol = 'https:';
		url.hostname = 'planck.gg';
		url.port = '';
		return Response.redirect(url.toString(), 301);
	},
};
