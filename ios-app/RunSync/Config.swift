import Foundation

enum Config {
    static let supabaseURL = "https://iwzlxizgppghjpnasawy.supabase.co"
    static let supabaseAnonKey = "sb_publishable_UtdPk3ZZcmObJLnv32udYA_m7tFORDe"

    // MyRunningApp (app web), ouverte par « Ouvrir MyRunningApp » quand on n'a pas encore de compte ou qu'on a
    // oublié son mot de passe. S'ouvre dans le navigateur : iOS ne sait pas rouvrir l'app installée sur l'écran
    // d'accueil depuis une autre app.
    static let dashboardURL = "https://alemomar.github.io/myrunningapp/web/index.html"
}
