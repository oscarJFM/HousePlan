import SwiftUI

struct AuthView: View {
    @EnvironmentObject var supabase: SupabaseService

    @State private var email = ""
    @State private var password = ""
    @State private var isSignUp = false
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Logo
            VStack(spacing: 12) {
                Image(systemName: "house.fill")
                    .font(.system(size: 52))
                    .foregroundStyle(.orange)
                Text("HousePlan")
                    .font(.largeTitle.bold())
                Text("Your home's complete maintenance record")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.bottom, 48)

            // Form card
            VStack(spacing: 16) {
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .autocapitalization(.none)
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                SecureField("Password", text: $password)
                    .textContentType(isSignUp ? .newPassword : .password)
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                if let err = errorMessage {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    Task { await submit() }
                } label: {
                    if isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text(isSignUp ? "Create Account" : "Sign In")
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(.orange)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .disabled(isLoading || email.isEmpty || password.isEmpty)
            }
            .padding(24)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.06), radius: 16, y: 4)
            .padding(.horizontal, 24)

            Button {
                withAnimation { isSignUp.toggle() }
                errorMessage = nil
            } label: {
                Text(isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
            .padding(.top, 16)

            Spacer()
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
    }

    private func submit() async {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            if isSignUp {
                try await supabase.signUp(email: email, password: password)
                isSignUp = false
            } else {
                try await supabase.signIn(email: email, password: password)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
