// Proposed cuisine for a candidate, from explicit source data only. Blank when
// unclear: never guessed, and never read from halal tags or categories.

export const CUISINES = [
  "Malay", "Chinese", "Kopitiam", "Mamak", "Seafood", "Indian", "Western", "Japanese",
  "Korean", "Thai", "Indonesian", "Sabahan", "Fast food", "Cafe", "Bakery and dessert",
] as const;
export type Cuisine = (typeof CUISINES)[number] | "";

// OSM `cuisine` values that name a cuisine. `malaysian` is left out on purpose:
// it could be Malay, Chinese or mamak.
const OSM_SPECIFIC: Record<string, Cuisine> = {
  malay: "Malay",
  chinese: "Chinese", cantonese: "Chinese", hakka: "Chinese", hainanese: "Chinese", dim_sum: "Chinese",
  kopitiam: "Kopitiam",
  mamak: "Mamak", nasi_kandar: "Mamak",
  seafood: "Seafood", fish: "Seafood",
  indian: "Indian", south_indian: "Indian", north_indian: "Indian",
  western: "Western", american: "Western", steak_house: "Western", european: "Western", italian: "Western", french: "Western",
  japanese: "Japanese", sushi: "Japanese", ramen: "Japanese",
  korean: "Korean",
  thai: "Thai",
  indonesian: "Indonesian",
  sabahan: "Sabahan", kadazan: "Sabahan", kadazandusun: "Sabahan", kadazan_dusun: "Sabahan",
};

// Values that only say what kind of place it is. Used after the name rules.
const OSM_GENERIC: Record<string, Cuisine> = {
  burger: "Fast food", pizza: "Fast food", fried_chicken: "Fast food", sandwich: "Fast food",
  coffee_shop: "Cafe", coffee: "Cafe",
  bakery: "Bakery and dessert", cake: "Bakery and dessert", dessert: "Bakery and dessert",
  ice_cream: "Bakery and dessert", donut: "Bakery and dessert", pastry: "Bakery and dessert",
};
const OSM_AMENITY: Record<string, Cuisine> = { fast_food: "Fast food", cafe: "Cafe" };

// Overture taxonomy categories. A place's hierarchy is checked from most to least
// specific, so `chinese_restaurant`'s children map to Chinese. `malaysian_restaurant`
// and `halal_restaurant` aren't listed, so they stay blank.
const OVERTURE_SPECIFIC: Record<string, Cuisine> = {
  chinese_restaurant: "Chinese", hong_kong_style_cafe: "Chinese",
  seafood_restaurant: "Seafood",
  indian_restaurant: "Indian",
  american_restaurant: "Western", north_american_restaurant: "Western", steakhouse: "Western", european_restaurant: "Western",
  japanese_restaurant: "Japanese",
  korean_restaurant: "Korean",
  thai_restaurant: "Thai",
  indonesian_restaurant: "Indonesian",
};
const OVERTURE_GENERIC: Record<string, Cuisine> = {
  fast_food_restaurant: "Fast food", burger_restaurant: "Fast food",
  cafe: "Cafe", coffee_shop: "Cafe",
  bakery: "Bakery and dessert", dessert_shop: "Bakery and dessert",
};

/** Kopitiam and Mamak are named in the place's own name often enough to trust it. */
export function cuisineFromName(name: string): Cuisine {
  const n = name.toLowerCase();
  if (/\b(kopitiam|kedai kopi)\b/.test(n)) return "Kopitiam";
  if (/\b(mamak|nasi kandar)\b/.test(n)) return "Mamak";
  return "";
}

function firstMapped(keys: readonly string[], table: Record<string, Cuisine>): Cuisine {
  for (const k of keys) if (table[k]) return table[k];
  return "";
}

/** From OSM tags: the cuisine tag, then the name rules, then the amenity. */
export function cuisineFromOsm(tags: Readonly<Record<string, string>>): Cuisine {
  const values = (tags.cuisine ?? "").split(";").map((v) => v.trim().toLowerCase()).filter(Boolean);
  return (
    firstMapped(values, OSM_SPECIFIC) ||
    cuisineFromName(tags.name ?? "") ||
    firstMapped(values, OSM_GENERIC) ||
    firstMapped([tags.amenity ?? ""], OSM_AMENITY)
  );
}

/** From an Overture taxonomy hierarchy (general to specific) and name. */
export function cuisineFromOverture(hierarchy: readonly string[], name: string): Cuisine {
  const specificFirst = [...hierarchy].reverse();
  return (
    firstMapped(specificFirst, OVERTURE_SPECIFIC) ||
    cuisineFromName(name) ||
    firstMapped(specificFirst, OVERTURE_GENERIC)
  );
}
