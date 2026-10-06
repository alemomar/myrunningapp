import SwiftUI

// Premier lancement guidé, en trois étapes : date de départ, autorisation Apple Santé, import avec compteur.
// Puis « C'est fait » (ou « Aucune séance trouvée »). Maquettes validées par Omar le 06/10/2026.

// MARK: - Étape 1 : depuis quand ?

// Trois durées toutes prêtes, 1 an coché d'office (assez pour les records et la progression), ou une date au choix.
// Remplace le calendrier réglé sur aujourd'hui, qui faisait tout valider sans rien importer.
struct ChooseDateView: View {
    enum Period: CaseIterable {
        case threeMonths, sixMonths, oneYear, custom
    }

    let onChosen: (Date) async throws -> Void

    @State private var period: Period
    @State private var customDate = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var isSaving = false
    @State private var error: String?

    init(startPeriod: Period = .oneYear, onChosen: @escaping (Date) async throws -> Void) {
        self.onChosen = onChosen
        _period = State(initialValue: startPeriod)
    }

    private func date(for period: Period) -> Date {
        let today = Calendar.current.startOfDay(for: Date())
        switch period {
        case .threeMonths: return Calendar.current.date(byAdding: .month, value: -3, to: today) ?? today
        case .sixMonths: return Calendar.current.date(byAdding: .month, value: -6, to: today) ?? today
        case .oneYear: return Calendar.current.date(byAdding: .year, value: -1, to: today) ?? today
        case .custom: return Calendar.current.startOfDay(for: customDate)
        }
    }

    private func since(_ date: Date) -> String {
        "depuis le " + date.formatted(Date.FormatStyle().day().month(.wide).year().locale(Theme.locale))
    }

    var body: some View {
        ScreenScaffold {
            StepHeader(step: 1)
            ScreenTitle(text: "Depuis quand ?").padding(.top, 28)
            BodyText("RunSync va chercher tes séances dans Apple Santé à partir de cette date. Ensuite, les nouvelles arriveront toutes seules.")
                .padding(.top, 10)
            VStack(spacing: 10) {
                option(.threeMonths, title: "Les 3 derniers mois")
                option(.sixMonths, title: "Les 6 derniers mois")
                option(.oneYear, title: "La dernière année", badge: "Conseillé")
                option(.custom, title: "Une autre date")
                if period == .custom {
                    // Version compacte (une ligne, calendrier à la demande) : le grand calendrier passait sous le bouton.
                    DatePicker(selection: $customDate, in: ...Date(), displayedComponents: .date) {
                        Text("Date de départ")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.text)
                    }
                    .datePickerStyle(.compact)
                    .tint(Theme.accent)
                    .environment(\.locale, Theme.locale)
                    .card(padding: 14)
                }
            }
            .padding(.top, 24)
            InfoNote(text: Text("Pourquoi 1 an ? C'est assez pour tes records et ta progression. Tu pourras remonter plus loin plus tard, dans MyRunningApp : Profil › Mon compte."))
                .padding(.top, 16)
        } bottom: {
            if let error {
                Text(error)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
            }
            Button {
                Task { await save() }
            } label: {
                if isSaving { ProgressView().tint(Theme.onAccent) } else { Text("Continuer") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isSaving)
        }
    }

    private func option(_ value: Period, title: String, badge: String? = nil) -> some View {
        let selected = period == value
        let subtitle = value == .custom && !selected ? "à choisir dans un calendrier" : since(date(for: value))
        return Button {
            withAnimation(.easeOut(duration: 0.2)) { period = value }
        } label: {
            HStack(spacing: 14) {
                Circle()
                    .strokeBorder(selected ? Theme.accent : Theme.faint, lineWidth: 2)
                    .background(Circle().fill(selected ? Theme.accent : .clear).padding(6))
                    .frame(width: 22, height: 22)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(title)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.text)
                        if let badge {
                            Text(badge)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.accent)
                                .padding(.horizontal, 9)
                                .padding(.vertical, 3)
                                .background(Theme.accent.opacity(0.14), in: Capsule())
                        }
                    }
                    Text(subtitle)
                        .font(.system(size: 13.5))
                        .foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
                if value == .custom {
                    Image(systemName: "calendar")
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.muted)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .background(selected ? Theme.accent.opacity(0.07) : Theme.surface,
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(selected ? Theme.accent : Theme.line, lineWidth: 1.5))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func save() async {
        isSaving = true
        error = nil
        do {
            try await onChosen(date(for: period))
        } catch {
            self.error = error is URLError
                ? "Pas de connexion : vérifie ton réseau, puis réessaie."
                : "Pas enregistré. Réessaie dans un instant."
        }
        isSaving = false
    }
}

// MARK: - Étape 2 : Apple Santé

// La fenêtre d'Apple n'apparaît qu'une fois : si on refuse ou qu'on décoche, RunSync ne peut plus la redemander.
// D'où cet écran, AVANT elle, qui montre où toucher.
struct HealthAccessView: View {
    let onContinue: () async -> Void
    @State private var isAsking = false

    var body: some View {
        ScreenScaffold {
            StepHeader(step: 2)
            ScreenTitle(text: "Autorise Apple Santé").padding(.top, 24)
            BodyText("Apple va t'afficher sa fenêtre d'autorisation. Elle n'apparaît qu'une seule fois : voici quoi toucher.")
                .padding(.top, 10)
            AppleSheetIllustration().padding(.top, 16)
            VStack(alignment: .leading, spacing: 10) {
                marker(1, Text("Touche ") + Text("Tout activer").fontWeight(.semibold).foregroundStyle(Theme.text))
                marker(2, Text("Puis ") + Text("Autoriser").fontWeight(.semibold).foregroundStyle(Theme.text) + Text(", en haut à droite"))
            }
            .padding(.top, 16)
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "lock")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 1)
                Text("RunSync lit seulement tes entraînements et ce qui va avec : fréquence cardiaque, distance, allure. Il n'écrit rien dans Apple Santé.")
                    .font(.system(size: 13.5))
                    .foregroundStyle(Theme.text3)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 16)
        } bottom: {
            Button {
                Task {
                    isAsking = true
                    await onContinue()
                    isAsking = false
                }
            } label: {
                if isAsking { ProgressView().tint(Theme.onAccent) } else { Text("Continuer") }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isAsking)
        }
    }

    private func marker(_ number: Int, _ text: Text) -> some View {
        HStack(spacing: 12) {
            NumberBadge(number: number, fill: Theme.marker, foreground: .white)
            text
                .font(.system(size: 15))
                .foregroundStyle(Theme.text2)
        }
    }
}

// Dessin simplifié de la fenêtre d'Apple, toujours en clair comme sur la maquette validée : les repères rouges 1 et 2
// montrent où toucher, dans l'ordre. Les libellés exacts sont ceux d'Apple (8 catégories demandées, 3 montrées).
struct AppleSheetIllustration: View {
    private let appleBlue = Color(hex: 0x007AFF)
    private let separator = Color(hex: 0xE5E5EA)

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Écran d'Apple, simplifié")
                .font(.system(size: 11, weight: .medium))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(Theme.muted)
            VStack(spacing: 0) {
                HStack {
                    Text("Ne pas autoriser").foregroundStyle(appleBlue)
                    Spacer(minLength: 4)
                    Text("Accès Santé").fontWeight(.semibold).foregroundStyle(.black)
                    Spacer(minLength: 4)
                    HStack(spacing: 6) {
                        Text("Autoriser").fontWeight(.semibold).foregroundStyle(appleBlue)
                        NumberBadge(number: 2, size: 20, fill: Theme.marker, foreground: .white)
                    }
                    .padding(.leading, 8)
                    .padding(.trailing, 4)
                    .padding(.vertical, 3)
                    .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(Theme.marker, lineWidth: 2.5))
                }
                .font(.system(size: 14))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                Rectangle().fill(Color(hex: 0xD8D8DE)).frame(height: 1)
                HStack {
                    Text("Tout activer").foregroundStyle(appleBlue)
                    Spacer()
                    NumberBadge(number: 1, size: 20, fill: Theme.marker, foreground: .white)
                }
                .font(.system(size: 15))
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(.white, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(Theme.marker, lineWidth: 2.5))
                .padding(.horizontal, 10)
                .padding(.top, 10)
                Text("Autoriser « RunSync » à lire")
                    .font(.system(size: 11.5))
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(Color(hex: 0x6C6C70))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 22)
                    .padding(.top, 12)
                    .padding(.bottom, 6)
                VStack(spacing: 0) {
                    toggleRow("Entraînements")
                    toggleRow("Fréquence cardiaque")
                    toggleRow("Distance")
                    Text("et 5 autres")
                        .font(.system(size: 14))
                        .foregroundStyle(Color(hex: 0x6C6C70))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                }
                .background(.white, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .padding(.horizontal, 10)
                .padding(.bottom, 10)
            }
            .background(Color(hex: 0xF2F2F7), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Dessin de la fenêtre d'Apple : touche d'abord Tout activer, puis Autoriser en haut à droite.")
    }

    private func toggleRow(_ label: String) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(label).font(.system(size: 15)).foregroundStyle(.black)
                Spacer()
                Capsule()
                    .fill(Color(hex: 0xE9E9EA))
                    .frame(width: 40, height: 24)
                    .overlay(alignment: .leading) {
                        Circle()
                            .fill(.white)
                            .frame(width: 20, height: 20)
                            .shadow(color: .black.opacity(0.2), radius: 1, y: 1)
                            .padding(.leading, 2)
                    }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            Rectangle().fill(separator).frame(height: 1).padding(.leading, 12)
        }
    }
}

// MARK: - Étape 3 : import

struct ImportView: View {
    @EnvironmentObject private var coordinator: SyncCoordinator
    let onRetry: () -> Void

    var body: some View {
        ScreenScaffold {
            StepHeader(step: 3)
            ScreenTitle(text: "Import de tes séances").padding(.top, 28)
            BodyText("RunSync lit tes séances dans Apple Santé et les envoie à MyRunningApp.")
                .padding(.top, 10)
            progressCard.padding(.top, 32)
            InfoNote(text: Text("Garde RunSync ouvert jusqu'à la fin. Si tu le quittes, l'import reprendra à la prochaine ouverture."))
                .padding(.top, 16)
        } bottom: {
            if coordinator.importError != nil {
                Button("Réessayer", action: onRetry).buttonStyle(PrimaryButtonStyle())
            }
        }
        // Écran allumé pendant l'import : iPhone verrouillé = Apple Santé illisible et import interrompu.
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    @ViewBuilder
    private var progressCard: some View {
        VStack(spacing: 14) {
            if let error = coordinator.importError {
                Image(systemName: "exclamationmark.circle")
                    .font(.system(size: 30))
                    .foregroundStyle(Theme.text2)
                Text("L'import s'est arrêté")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.text)
                Text(error)
                    .font(.system(size: 14.5))
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                switch coordinator.importPhase {
                case .searching:
                    ProgressView().tint(Theme.accent).controlSize(.large).padding(.vertical, 18)
                    status("Recherche de tes séances dans Apple Santé…")
                case .progressing(let progress):
                    counter(progress)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 24)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
    }

    @ViewBuilder
    private func counter(_ progress: SyncProgress) -> some View {
        let (done, total, fraction, label): (Int, Int, Double, String) = {
            switch progress {
            case .reading(let done, let total):
                let share = total == 0 ? 0 : Double(done) / Double(total)
                return (done, total, share * 0.9, "Lecture d'Apple Santé…")
            case .sending(let total):
                return (total, total, 0.95, "Envoi vers MyRunningApp…")
            }
        }()
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(done)")
                .font(Theme.display(88))
                .foregroundStyle(Theme.accent)
                .contentTransition(.numericText())
            Text("/ \(total)")
                .font(Theme.display(34))
                .foregroundStyle(Theme.muted)
        }
        .monospacedDigit()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(done) séances sur \(total)")
        Text("séances")
            .font(.system(size: 15))
            .foregroundStyle(Theme.text2)
        Capsule()
            .fill(Theme.control)
            .frame(height: 10)
            .overlay(alignment: .leading) {
                GeometryReader { geometry in
                    Capsule()
                        .fill(Theme.accent)
                        .frame(width: max(10, geometry.size.width * fraction))
                }
            }
            .animation(.easeOut(duration: 0.3), value: fraction)
            .accessibilityHidden(true)
        status(label)
    }

    private func status(_ text: String) -> some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small).tint(Theme.accent)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.text3)
        }
    }
}

// MARK: - Fin du premier import

struct DoneView: View {
    let summary: ImportSummary
    let onFinish: () -> Void

    private var summaryText: Text {
        let sent = Text(plural(summary.sessions, "séance envoyée", "séances envoyées")).fontWeight(.semibold).foregroundStyle(Theme.text)
        if summary.runs == summary.sessions {
            return Text(plural(summary.runs, "course envoyée", "courses envoyées")).fontWeight(.semibold).foregroundStyle(Theme.text)
                + Text(" à MyRunningApp.")
        }
        if summary.runs == 0 { return sent + Text(" à MyRunningApp.") }
        return sent + Text(" à MyRunningApp, dont ")
            + Text(plural(summary.runs, "course", "courses")).fontWeight(.semibold).foregroundStyle(Theme.text)
            + Text(".")
    }

    var body: some View {
        ScreenScaffold {
            VStack(spacing: 14) {
                Image(systemName: "checkmark")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(Theme.onAccent)
                    .frame(width: 76, height: 76)
                    .background(Theme.accent, in: Circle())
                    .accessibilityHidden(true)
                ScreenTitle(text: "C'est fait !", size: 40).padding(.top, 6)
                summaryText
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 24)
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    AppIconImage(name: "LogoMyRunningApp", size: 40)
                    Text("Retourne dans MyRunningApp")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.text)
                }
                BackLinkIllustration()
                Text("Touche ce petit retour. Tu ne le vois pas ? Ouvre MyRunningApp depuis ton écran d'accueil.")
                    .font(.system(size: 14.5))
                    .foregroundStyle(Theme.text2)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .card(border: Theme.text, borderWidth: 1.5)
            .padding(.top, 28)
            InfoNote(icon: "arrow.triangle.2.circlepath",
                     text: Text("Et ensuite ? ").fontWeight(.semibold).foregroundStyle(Theme.text2)
                        + Text("Rien à faire : tes prochaines courses arriveront toutes seules après chaque sortie. Tu n'auras plus besoin d'ouvrir RunSync."))
                .padding(.top, 12)
        } bottom: {
            Button("Terminé", action: onFinish).buttonStyle(SecondaryButtonStyle())
        }
    }
}

// MARK: - Aucune séance trouvée

// Apple ne dit jamais à une app qu'on lui a refusé l'accès : elle ne reçoit simplement rien. Zéro séance peut donc
// vouloir dire « jamais couru avec la montre » ou « accès coupé » ; l'écran couvre les deux cas.
struct NoWorkoutsView: View {
    let since: Date
    let onRetry: () -> Void
    let onContinue: () -> Void

    var body: some View {
        ScreenScaffold {
            VStack(spacing: 14) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(Theme.text2)
                    .frame(width: 72, height: 72)
                    .background(Theme.surface, in: Circle())
                    .overlay(Circle().strokeBorder(Theme.line, lineWidth: 1))
                    .accessibilityHidden(true)
                ScreenTitle(text: "Aucune séance trouvée").padding(.top, 6)
                Text("RunSync n'a trouvé aucune séance dans Apple Santé depuis le " + since.formatted(Date.FormatStyle().day().month(.wide).year().locale(Theme.locale)) + ".")
                    .font(.system(size: 15.5))
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 24)
            caseCard(title: "Tu n'as encore jamais couru avec ta montre ou ton iPhone ?",
                     text: Text("Pas de souci : ta prochaine course arrivera toute seule."))
                .padding(.top, 28)
            caseCard(title: "Tu as pourtant des courses dans Apple Santé ?",
                     text: Text("L'accès est sans doute coupé. Ouvre ")
                        + Text("Réglages › Confidentialité et sécurité › Santé › RunSync").fontWeight(.semibold).foregroundStyle(Theme.text)
                        + Text(", puis touche ")
                        + Text("Tout activer").fontWeight(.semibold).foregroundStyle(Theme.text)
                        + Text("."))
                .padding(.top, 10)
        } bottom: {
            Button("Réessayer", action: onRetry).buttonStyle(PrimaryButtonStyle())
            Button("Continuer sans séance", action: onContinue).buttonStyle(QuietLinkStyle(underline: true))
        }
    }

    private func caseCard(title: String, text: Text) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 15.5, weight: .semibold))
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
            text
                .font(.system(size: 14))
                .foregroundStyle(Theme.text3)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .card()
    }
}
