import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/+esm';

const SUPABASE_URL = 'https://ajyultndtauabfufrmfr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nM8F8D8JopLP0BiIEdJInQ_bQBRDw_I';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function mapProductRow(row) {
  return {
    id: row.id,
    sku: row.sku,
    rank: row.rank,
    badge: row.badge,
    priority: row.priority,
    name: row.name,
    brand: row.brand,
    volume: row.volume,
    gender: row.gender,
    family: row.family,
    occasion: row.occasion,
    climate: row.climate,
    price: row.price == null ? null : Number(row.price),
    pixPrice: row.pix_price == null ? null : Number(row.pix_price),
    cost: row.cost == null ? null : Number(row.cost),
    stock: Number(row.stock || 0),
    minimumStock: Number(row.minimum_stock || 0),
    status: row.status,
    fixation: row.fixation,
    projection: row.projection,
    inspiredBy: row.inspired_by,
    description: row.description,
    topNotes: row.top_notes,
    heartNotes: row.heart_notes,
    baseNotes: row.base_notes,
    notes: {
      top: row.top_notes,
      heart: row.heart_notes,
      base: row.base_notes,
    },
    visual: row.visual,
    image: row.image,
    active: row.active,
  };
}

export function mapSettingsRow(row) {
  if (!row) return {};
  return {
    name: row.name,
    shortName: row.short_name,
    slogan: row.slogan,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    email: row.email,
    freeShippingFrom: row.free_shipping_from == null ? null : Number(row.free_shipping_from),
    siteUrl: row.site_url,
  };
}
