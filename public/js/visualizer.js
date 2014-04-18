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
		// console.log('world bounds = ',JSON.stringify(bounds,null,4));

		// 1. scale must match the larger of (x2-x1)/width, (y2-y1)/height
		var x1 = bounds[0][0];
		var x2 = bounds[1][0];
		var y1 = bounds[0][1];
		var y2 = bounds[1][1];

		var s = 1.1/Math.max((x2-x1)/width, (y2-y1)/height);
		var t = [(width - s * (x1+x2))/2, (height - s * (y1+y2))/2];

		// update the projection
		projection.scale(s).translate(t);

		// smaller pixel size for points
		path.pointRadius(3);

		// return the path
		return path;
	}


	return function(err, featureCollection) {
		// store the paths inside the cache
		pathCache[className] = featureCollection;

		// generate a path with global bounds
		var path = generatePath();

		// the path will automatically use the new projection
		// console.log('scaled bounds = ',JSON.stringify(path.bounds(featureCollection), null, 4));

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

var URL = 'http://webservices.nextbus.com/service/publicXMLFeed',
	PAYLOAD_DATA = {
		vehicleLocations: function(agency, route, time) {
			agency = agency || 'sf-muni';
			route = route || '30';
			time = time || '0';

			return {
				command: 'vehicleLocations',
				a: agency,
				r: route,
				t: time
			}
		},
		agencyList: function() {
			return {
				command: 'agencyList'
			}
		},
		routeList: function(agency) {
			agency = agency || 'sf-muni';
			return {
				command: 'routeList',
				a: agency
			}
		}
	};

// encapsulate "threads" spawned
var Timer = (function() {
	var threadStatus = {};

	var threadMaker = function(id, agency, route, refresh) {
		console.log('Creating thread',id,'| agency = ',agency,'| route = ',route,'| refresh=',refresh);
		refresh = refresh || 15000; // default

		var thread = function() {
			
			// do ajax, etc.
			$.get(URL, PAYLOAD_DATA.vehicleLocations(agency, route, 0), function(data, textStatus, jqXHR) {
				var vehicles = data.getElementsByTagName('vehicle');
				var lastTime = data.getElementsByTagName('lastTime')[0].getAttribute('time');
				// console.log(vehicles);

				// convert XML Doc to GeoJSON format
				var features = [];

				for (var i=0; i < vehicles.length; i+=1) {
					var vehicle = vehicles[i];
					var feature = {
						type: "Feature",
						properties: {},
						geometry: {
							type: "Point"
						}
					};

					// boring data transfer
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

				// check the status. if it signals a stop, then don't try and render and reschedule
				if (threadStatus[id]) {
					// render on the canvas now
					renderGEOJson('buses')(null, {
						type: "FeatureCollection",
						features: features
					});

					// console.log(features);
					// reschedule
					setTimeout(thread, refresh);					
				} else {
					console.log('Stopping thread',id);
					delete threadStatus[id];
				};
				
			}); // end $.get
		} // end thread function

		return thread;
	};

	var spawn = function(agency, route, refresh) {
		var id = (new Date()).getTime();

		// mark all other threads as off
		for (thread in threadStatus) {
			threadStatus[thread] = false;
		};

		// track the new thread
		threadStatus[id] = true;

		// create the thread and start it
		var thread = threadMaker(id, agency, route, refresh);
		thread();
	}

	return {
		'spawn': spawn
	};
}());


$(function() {
	var $agencyDropdown = $('select[name="agency"]'),
		$routeDropdown = $('select[name="route"]');

	// load agencies (one-time)
	$.get(URL, PAYLOAD_DATA.agencyList(), function(data, textStatus, jqXHR) {
		//domdomdom
		var agencies = data.getElementsByTagName('agency'),
			i, agency, $option;

		for (i=0; i < agencies.length; i+=1) {
			agency = agencies[i];
			$option = $('<option></option>');

			$option.val(agency.getAttribute('tag'));
			$option.text(agency.getAttribute('title'));

			$agencyDropdown.append($option);
		}
		
	});

	// load routes for given agency
	$agencyDropdown.on('change', function() {
		var agency = $agencyDropdown.val();

		// always clear the routes
		$routeDropdown.empty().append('<option value="">Select a route</option>');

		if (agency !== '') {
			$.get(URL, PAYLOAD_DATA.routeList(agency), function(data, textStatus, jqXHR) {
				var routes = data.getElementsByTagName('route'),
					i, route, $option;

				for (i=0; i < routes.length; i+=1) {
					route = routes[i];
					$option = $('<option></option>');

					$option.val(route.getAttribute('tag'));
					$option.text(route.getAttribute('title'));

					$routeDropdown.append($option);
				}

			});
		}

	});

	$routeDropdown.on('change', function() {
		Timer.spawn($agencyDropdown.val(),$routeDropdown.val(),5000);
	});

});