var width = 960, height = 1160;
var svg = d3.select('div#visual-container').append('svg').attr('width', width).attr('height', height);

// heavy references to https://github.com/mbostock/d3/wiki/Geo-Paths
d3.json('/sfmaps/streets.json', function(err, streets) {

	// so there are too many damned paths. Cut it down to one.
	var selectedFeatures = streets.features;

	// lots of references to http://stackoverflow.com/a/14691788
 	var projection = d3.geo.albers().scale(1).translate([0, 0]);
	var path = d3.geo.path().projection(projection);
	var bounds = path.bounds(streets);

	// based on the bounds, create a new projection
	console.log('bounds = ',JSON.stringify(bounds,null,4));

	// 1. scale must match the larger of (x2-x1)/width, (y2-y1)/height
	var x1 = bounds[0][0];
	var x2 = bounds[1][0];
	var y1 = bounds[0][1];
	var y2 = bounds[1][1];

	var s = .95/Math.max((x2-x1)/width, (y2-y1)/height);
	var t = [(width - s * (x1+x2))/2, (height - s * (y1+y2))/2];

	// update the projection
	projection.scale(s).translate(t);

	// the path will automatically use the new projection
	console.log('new bounds = ',JSON.stringify(path.bounds(streets), null, 4));

	svg.selectAll('path')
		.data(selectedFeatures)
	.enter().append('path')
		.attr('d', path)
		.attr('stroke', 'black');
});
