// Places to eat in greater Kota Kinabalu: city centre, Likas, Inanam,
// Menggatal, Luyang, Damai, Tanjung Aru, Kepayan, Penampang (Donggongon)
// and Putatan. Paste into https://overpass-turbo.eu to see them on a map.
[out:json][timeout:180][bbox:5.865,116.035,6.050,116.175];
nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"];
out center tags;
