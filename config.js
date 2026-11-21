/* Stockaarud : base de données par défaut.
   Sur l'adresse commune, ce fichier reste vide : chaque CAARUD branche sa propre base
   au premier lancement, puis l'adresse de la base voyage dans le QR code d'invitation.
   Si vous hébergez votre propre copie, vous pouvez la remplir (Supabase › Project Settings › API). */
window.STOCKAARUD_CONFIG = {
  supabaseUrl: "",   // ex. "https://abcdefghijkl.supabase.co"
  supabaseKey: ""    // la clé publique « anon » ou « publishable » (jamais la clé service_role)
};
