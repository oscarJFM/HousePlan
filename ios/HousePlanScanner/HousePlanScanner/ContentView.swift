import SwiftUI

struct ContentView: View {
    @EnvironmentObject var supabase: SupabaseService

    var body: some View {
        if supabase.currentUser != nil {
            DashboardView()
        } else {
            AuthView()
        }
    }
}
