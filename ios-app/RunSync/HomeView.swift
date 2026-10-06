import SwiftUI

// Écran des jours suivants : RunSync travaille en arrière-plan, l'écran ne sert qu'à rassurer (compte connecté,
// dernière synchro) et à forcer une synchro juste après une course.
struct HomeView: View {
    @EnvironmentObject private var coordinator: SyncCoordinator
    let email: String?
    let cameFromMyRunningApp: Bool   // voir DoneView : le petit retour d'iOS n'existe que dans ce cas
    let onSignOut: () -> Void

    @State private var confirmSignOut = false

    var body: some View {
        ScreenScaffold {
            HStack(spacing: 12) {
                AppIconImage(name: "LogoRunSync", size: 44)
                Wordmark(size: 30)
            }
            .padding(.top, 8)
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Circle().fill(Theme.accent).frame(width: 10, height: 10).accessibilityHidden(true)
                    Text("Connecté à MyRunningApp")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.text)
                }
                if let email {
                    HStack(spacing: 10) {
                        Image(systemName: "person")
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.muted)
                            .accessibilityHidden(true)
                        Text(email)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.text2)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
                Rectangle().fill(Theme.line).frame(height: 1)
                HStack(alignment: .firstTextBaseline) {
                    Text("Dernière synchronisation")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.text3)
                    Spacer(minLength: 12)
                    Text(SyncCoordinator.lastSyncText(coordinator.lastSync))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.text)
                }
            }
            .card()
            .padding(.top, 28)
            Text("Tes courses arrivent toutes seules après chaque sortie. Tu n'as rien à faire.")
                .font(.system(size: 14.5))
                .foregroundStyle(Theme.text3)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 16)
                .padding(.horizontal, 2)
            Button {
                Task { await coordinator.sync() }
            } label: {
                HStack(spacing: 8) {
                    if coordinator.isSyncing {
                        ProgressView().tint(Theme.text)
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 16, weight: .semibold))
                    }
                    Text(coordinator.isSyncing ? "Synchronisation…" : "Synchroniser maintenant")
                }
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(coordinator.isSyncing)
            .padding(.top, 24)
            Text(syncHint)
                .font(.system(size: 13))
                .foregroundStyle(syncHintColor)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
        } bottom: {
            Text(cameFromMyRunningApp
                 ? "Pour revenir dans MyRunningApp : touche le petit retour, tout en haut à gauche."
                 : "Pour revenir dans MyRunningApp : ouvre-la depuis ton écran d'accueil.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button("Se déconnecter") { confirmSignOut = true }
                .buttonStyle(QuietLinkStyle(underline: true))
        }
        .confirmationDialog("Se déconnecter de RunSync ?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Se déconnecter", role: .destructive, action: onSignOut)
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Tes courses n'arriveront plus dans MyRunningApp tant que tu ne te reconnectes pas.")
        }
    }

    private var syncHint: String {
        switch coordinator.homeStatus {
        case .idle, .syncing: return "Pratique juste après une course, pour la voir tout de suite."
        case .upToDate: return "C'est à jour."
        case .failed(let message): return message
        }
    }

    private var syncHintColor: Color {
        if case .upToDate = coordinator.homeStatus { return Theme.accent }
        if case .failed = coordinator.homeStatus { return Theme.text2 }
        return Theme.muted
    }
}

// RunSync ouvert par le guide de MyRunningApp (myrunningapp://connexion?email=…) alors qu'il est connecté à un autre
// compte : les courses partiraient là-bas sans que personne ne s'en rende compte.
struct OtherAccountView: View {
    let currentEmail: String
    let wantedEmail: String
    let onSwitch: () -> Void
    let onKeep: () -> Void

    var body: some View {
        ScreenScaffold {
            VStack(spacing: 14) {
                Image(systemName: "person.2")
                    .font(.system(size: 26, weight: .medium))
                    .foregroundStyle(Theme.attention)
                    .frame(width: 72, height: 72)
                    .background(Theme.attention.opacity(0.16), in: Circle())
                    .accessibilityHidden(true)
                ScreenTitle(text: "Un autre compte est connecté").multilineTextAlignment(.center).padding(.top, 6)
                Text("Tu viens de MyRunningApp, mais RunSync envoie tes séances à un autre compte.")
                    .font(.system(size: 15.5))
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 24)
            VStack(alignment: .leading, spacing: 0) {
                row(label: "RunSync envoie à", value: currentEmail, color: Theme.attention)
                Rectangle().fill(Theme.line).frame(height: 1)
                row(label: "MyRunningApp est ouvert avec", value: wantedEmail, color: Theme.text)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
            .padding(.top, 28)
            Text("Tant que c'est comme ça, tes séances n'apparaissent pas dans ton MyRunningApp.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.text3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 14)
                .padding(.horizontal, 2)
        } bottom: {
            Button("Me connecter avec \(wantedEmail)", action: onSwitch)
                .buttonStyle(PrimaryButtonStyle())
            Button("Garder \(currentEmail)", action: onKeep)
                .buttonStyle(SecondaryButtonStyle())
        }
    }

    private func row(label: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.text3)
            Text(value)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(color)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
