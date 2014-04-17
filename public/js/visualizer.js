var width = 960, height = 1160;
var svg = d3.select('div#visual-container').append('svg').attr('width', width).attr('height', height);
var pathCache = {};

var renderGEOJson = function(className) {

	if (!className) {
		throw new Error("Specify a valid classname to render these paths");
	}

	function generatePath() {
		// based upon cached paths, calculate global bounds and determine a universal
		// projection for all of them
		var allfeatures = [];

		for (key in pathCache) {
			allfeatures = allfeatures.concat(pathCache[key].features);
		}

		// lots of references to http://stackoverflow.com/a/14691788
	 	var projection = d3.geo.albers().scale(1).translate([0, 0]);
		var path = d3.geo.path().projection(projection);
		var bounds = path.bounds({type: "FeatureCollection", features: allfeatures});

		// based on the bounds, create a new projection
		console.log('world bounds = ',JSON.stringify(bounds,null,4));

		// 1. scale must match the larger of (x2-x1)/width, (y2-y1)/height
		var x1 = bounds[0][0];
		var x2 = bounds[1][0];
		var y1 = bounds[0][1];
		var y2 = bounds[1][1];

		var s = .95/Math.max((x2-x1)/width, (y2-y1)/height);
		var t = [(width - s * (x1+x2))/2, (height - s * (y1+y2))/2];

		// update the projection
		projection.scale(s).translate(t);

		// return the path
		return path;
	}


	return function(err, streets) {
		// store the paths inside the cache
		pathCache[className] = streets;

		// generate a path with global bounds
		var path = generatePath();

		// the path will automatically use the new projection
		console.log('scaled bounds = ',JSON.stringify(path.bounds(streets), null, 4));

		// rerender all paths in the cache
		for (key in pathCache) {
			svg.selectAll('path.'+key).remove();
			svg.selectAll('path.'+key)
				.data(pathCache[key].features)
				.enter().append('path')
					.attr('d', path)
					.attr('class', key);
		}

	}
};

// heavy references to https://github.com/mbostock/d3/wiki/Geo-Paths
d3.json('/sfmaps/streets.json', renderGEOJson('streets'));
//d3.json('/sfmaps/arteries.json', renderGEOJson('arteries'));
//d3.json('/sfmaps/freeways.json', renderGEOJson('freeways'));
//d3.json('/sfmaps/neighborhoods.json', renderGEOJson('neighborhoods'));

var url = 'http://webservices.nextbus.com/service/publicXMLFeed';
var params = {
  command: 'vehicleLocations',
  a: 'sf-muni',
  r: 'N',
  t: '1144953500233'
};

$(function() {
	$.get(url, params, function(data, textStatus, jqXHR) {
		var vehicles = data.getElementsByTagName('vehicle');
		console.log(vehicles);

		var features = [];

		for (var i=0; i < vehicles.length; i++) {
			var vehicle = vehicles[i];
			var feature = {
				type: "Feature",
				properties: {},
				geometry: {
					type: "Point"
				}
			};

			feature.properties['id'] = vehicle.getAttribute('id');
			feature.properties['routeTag'] = vehicle.getAttribute('routeTag');
			feature.properties['dirTag'] = vehicle.getAttribute('dirTag');
			feature.geometry.coordinates = [];
			feature.geometry.coordinates.push(parseFloat(vehicle.getAttribute('lon')));
			feature.geometry.coordinates.push(parseFloat(vehicle.getAttribute('lat')));
			feature.geometry.coordinates.push(0.0);
			feature.properties['secsSinceReport'] = parseInt(vehicle.getAttribute('secsSinceReport'));
			feature.properties['predictable'] = vehicle.getAttribute('predictable');
			feature.properties['heading'] = vehicle.getAttribute('heading');
			feature.properties['speedKmHr'] = vehicle.getAttribute('speedKmHr');

			features.push(feature);

		}

		// we try to render on the canvas now
		renderGEOJson('buses')(null, {
			type: "FeatureCollection",
			features: features
		});

		console.log(features);
	})

});
/*
d3.xml(url)
.post('command=vehicleLocations&a=sf-muni&r=N&t=1144953500233', function(err, data) {
	console.log(data);
})
*/