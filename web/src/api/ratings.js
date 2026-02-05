import { supabase } from "../lib/supabaseClient";

export async function getMyRatings() {
  const { data, error } = await supabase
    .from("ratings")
    .select("question_id, rating");

  if (error) throw error;
  return data ?? [];
}

export async function upsertRating(questionId, rating) {
  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!u?.user) throw new Error("Not logged in");

  const { error } = await supabase
    .from("ratings")
    .upsert(
      { user_id: u.user.id, question_id: Number(questionId), rating: Number(rating) },
      { onConflict: "user_id,question_id" }
    );

  if (error) throw error;
}
