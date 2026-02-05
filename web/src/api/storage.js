import { supabase } from "../lib/supabaseClient";

// Downloads and parses JSON from a PRIVATE bucket object
export async function downloadJson(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;

  const text = await data.text();
  return JSON.parse(text);
}

// Returns a short-lived signed URL to a PRIVATE object
export async function createSignedImageUrl(bucket, path, expiresInSeconds = 60) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
