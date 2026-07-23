---
title: Weatherly
blurb: >-
  An interactive weather map — click anywhere on Earth for current conditions, a
  24-hour outlook, and a seven-day forecast.
stack: [React, Leaflet, Vite, Open-Meteo, Firebase Hosting]
repo: https://github.com/hotpath-hooligan/weatherly_maps
demo: https://weatherly-map.web.app/
order: 4
---

Weatherly is a full-screen OpenStreetMap canvas built with React and Leaflet:
click any point on the map, or search a city or postcode, and it renders local
conditions from the Open-Meteo forecast and geocoding APIs. There is no API key
and no backend — both endpoints are public and called directly from the browser.

The forecast panels cover temperature, apparent temperature, humidity,
precipitation, cloud cover, wind speed, gusts and compass direction, then the
next 24 hours at three-hour steps and a seven-day outlook with highs, lows,
precipitation chance, and sunrise and sunset. A units switch swaps Celsius and
Fahrenheit along with wind (km/h ↔ mph) and precipitation (mm ↔ inch).

Most of the design effort went into the states around the happy path. Place
search is debounced, geolocation degrades gracefully when permission is denied
or the context is insecure, and loading, empty, geolocation-error, and
service-error states are explicit rather than implied by a blank panel. The
interface theme is derived from the WMO weather code and the day/night state, so
the page itself reflects the conditions being described, and every interactive
control carries ARIA labelling.
