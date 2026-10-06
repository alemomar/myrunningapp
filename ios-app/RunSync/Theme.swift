import SwiftUI

// Couleurs de MyRunningApp (web/index.html, :root) reprises telles quelles, pour que RunSync ressemble à l'app
// qu'il alimente : fond noir, citron pour l'action principale, violet pour ce qui demande de l'attention.
enum Theme {
    static let bg = Color(hex: 0x0C0D0F)
    static let surface = Color(hex: 0x17191C)
    static let sunken = Color(hex: 0x0F1113)
    static let raised = Color(hex: 0x1B1E21)
    static let field = Color(hex: 0x131518)
    static let control = Color(hex: 0x22252A)
    static let line = Color(hex: 0x26292E)
    static let lineField = Color(hex: 0x2A2E33)
    static let text = Color(hex: 0xF2F3F0)
    static let text2 = Color(hex: 0xC9CCD0)
    static let text3 = Color(hex: 0xA3A7AD)
    static let muted = Color(hex: 0x8B8F96)
    static let faint = Color(hex: 0x5A6068)
    static let accent = Color(hex: 0xC6F432)
    static let onAccent = Color(hex: 0x0C0D0F)
    static let attention = Color(hex: 0xB688FE)   // oklch(0.72 0.17 300) de MyRunningApp
    // Repères « touche ici » de l'écran Apple Santé, en rouge à la demande d'Omar (06/10/2026). Ce rouge ne sert
    // qu'à ce guidage : MyRunningApp ne l'emploie que pour les suppressions.
    static let marker = Color(hex: 0xD92D20)

    // Titres : police du système en version étroite, à la place de Barlow Condensed (MyRunningApp). Rendu très
    // proche, sans fichier de police à embarquer dans l'app.
    static func display(_ size: CGFloat) -> Font { .system(size: size, weight: .bold).width(.condensed) }

    // L'app n'existe qu'en français : dates et heures toujours au format français, quelle que soit la langue de l'iPhone.
    static let locale = Locale(identifier: "fr_FR")
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

// MARK: - Boutons (comme .btn-primary et .btn-secondary du web)

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(Theme.onAccent)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Theme.accent, in: Capsule())
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.text)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Theme.control, in: Capsule())
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

// Lien discret : « Mot de passe oublié ? », « Se déconnecter »…
struct QuietLinkStyle: ButtonStyle {
    var color: Color = Theme.text3
    var weight: Font.Weight = .regular
    var underline = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: weight))
            .underline(underline)
            .foregroundStyle(color)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

// MARK: - Éléments communs

struct AppIconImage: View {
    let name: String   // "LogoRunSync" ou "LogoMyRunningApp" (Assets.xcassets)
    let size: CGFloat

    var body: some View {
        Image(name)
            .resizable()
            .interpolation(.high)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.225, style: .continuous))
            .accessibilityHidden(true)
    }
}

struct Wordmark: View {
    var size: CGFloat = 34

    var body: some View {
        (Text("Run").foregroundStyle(Theme.text) + Text("Sync").foregroundStyle(Theme.accent))
            .font(Theme.display(size))
            .accessibilityLabel("RunSync")
    }
}

struct ScreenTitle: View {
    let text: String
    var size: CGFloat = 34

    var body: some View {
        Text(text)
            .font(Theme.display(size))
            .textCase(.uppercase)
            .foregroundStyle(Theme.text)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

struct BodyText: View {
    let text: Text

    init(_ text: Text) { self.text = text }
    init(_ string: String) { self.text = Text(string) }

    var body: some View {
        text
            .font(.system(size: 15.5))
            .foregroundStyle(Theme.text2)
            .lineSpacing(3)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// « Étape 2 sur 3 » et ses trois traits.
struct StepHeader: View {
    let step: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Étape \(step) sur 3")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.text3)
            HStack(spacing: 6) {
                ForEach(1...3, id: \.self) { index in
                    Capsule()
                        .fill(index <= step ? Theme.accent : Theme.control)
                        .frame(height: 4)
                }
            }
            .accessibilityHidden(true)
        }
    }
}

struct InfoNote: View {
    var icon = "info.circle"
    let text: Text

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 15))
                .foregroundStyle(Theme.muted)
                .padding(.top, 1)
            text
                .font(.system(size: 13.5))
                .foregroundStyle(Theme.text3)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// Pastille numérotée : repères rouges de l'écran Apple Santé, étapes grises ailleurs.
struct NumberBadge: View {
    let number: Int
    var size: CGFloat = 26
    var fill = Theme.control
    var foreground = Theme.text

    var body: some View {
        Text("\(number)")
            .font(.system(size: size * 0.6, weight: .bold).width(.condensed))
            .foregroundStyle(foreground)
            .frame(width: size, height: size)
            .background(fill, in: Circle())
            .accessibilityHidden(true)
    }
}

// Apple Santé → RunSync → MyRunningApp : à quoi sert RunSync, en un coup d'œil.
struct FlowStrip: View {
    var body: some View {
        HStack(spacing: 6) {
            FlowItem(label: "Apple Santé", highlighted: false) {
                Image(systemName: "heart")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.text)
                    .frame(height: 22)
            }
            arrow
            FlowItem(label: "RunSync", highlighted: true) { AppIconImage(name: "LogoRunSync", size: 22) }
            arrow
            FlowItem(label: "MyRunningApp", highlighted: false) { AppIconImage(name: "LogoMyRunningApp", size: 22) }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Apple Santé, puis RunSync, puis MyRunningApp")
    }

    private var arrow: some View {
        Image(systemName: "arrow.right")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.faint)
    }
}

private struct FlowItem<Icon: View>: View {
    let label: String
    let highlighted: Bool
    @ViewBuilder let icon: () -> Icon

    var body: some View {
        VStack(spacing: 4) {
            icon()
            Text(label)
                .font(.system(size: 11.5, weight: highlighted ? .semibold : .regular))
                .foregroundStyle(highlighted ? Theme.accent : Theme.text3)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }
}

// Le petit retour « ◀ MyRunningApp » qu'iOS affiche en haut à gauche quand une app en a ouvert une autre.
struct BackLinkIllustration: View {
    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 5) {
                Image(systemName: "arrowtriangle.left.fill")
                    .font(.system(size: 8))
                Text("MyRunningApp")
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(Theme.text)
            .padding(.leading, 9)
            .padding(.trailing, 10)
            .padding(.vertical, 5)
            .overlay(Capsule().strokeBorder(Theme.accent, lineWidth: 2))
            Text("tout en haut à gauche de ton écran")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.sunken, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityHidden(true)
    }
}

struct CloseButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.text)
                .frame(width: 36, height: 36)
                .background(Theme.control, in: Circle())
        }
        .accessibilityLabel("Fermer")
    }
}

extension View {
    // Bande de l'heure : le contenu qui défile ne passe plus dessous (le texte se mélangeait à l'heure, capture d'Omar
    // du 06/10/2026). Une vue de hauteur nulle posée en haut de la zone sûre, dont le fond remonte dans la bande.
    func statusBarMask() -> some View {
        safeAreaInset(edge: .top, spacing: 0) {
            Color.clear
                .frame(height: 0)
                .background(Theme.bg, ignoresSafeAreaEdges: .top)
                .allowsHitTesting(false)
        }
    }

    func card(border: Color = Theme.line, borderWidth: CGFloat = 1, padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(border, lineWidth: borderWidth))
    }
}

// Écran type : contenu qui défile (petits iPhone, clavier ouvert) et boutons toujours visibles en bas.
struct ScreenScaffold<Content: View, Bottom: View>: View {
    @ViewBuilder let content: () -> Content
    @ViewBuilder let bottom: () -> Bottom

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) { content() }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.top, 12)
                .padding(.bottom, 24)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 6) { bottom() }
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 8)
                .background(Theme.bg)
        }
        .background(Theme.bg.ignoresSafeArea())
        .statusBarMask()
    }
}

// Accord des mots selon le nombre : « 1 séance », « 120 séances ».
func plural(_ count: Int, _ one: String, _ many: String) -> String {
    "\(count) \(count > 1 ? many : one)"
}
