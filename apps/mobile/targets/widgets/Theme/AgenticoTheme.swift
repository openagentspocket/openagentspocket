import SwiftUI
import UIKit

/// One complete look for the app: semantic color tokens that every view
/// reads instead of raw colors. Built-in themes are generated from
/// `design/theme/themes/*.json` by `design/theme/build_theme.py`
/// (`AgenticoTheme+BuiltIn.swift`); `design/theme/README.md` says what each
/// token is for.
struct AgenticoTheme: Identifiable, Equatable, Sendable {
    enum Appearance: String, Sendable {
        case dark, light

        /// The appearance of a SwiftUI color scheme.
        init(_ colorScheme: ColorScheme) {
            self = colorScheme == .dark ? .dark : .light
        }

        var colorScheme: ColorScheme { self == .dark ? .dark : .light }
    }

    /// Token names match the JSON keys one to one.
    struct Colors: Equatable, Sendable {
        /// Behind everything: the screen background.
        let canvas: ThemeColor
        /// Cards and grouped rows on the canvas.
        let surface: ThemeColor
        /// Sheets, drawers, and popovers.
        let surfaceRaised: ThemeColor
        /// Cards inside a raised surface.
        let surfaceOverlay: ThemeColor
        /// Unselected controls: toggle tracks, steppers, round buttons.
        let control: ThemeColor
        let separator: ThemeColor
        let textPrimary: ThemeColor
        let textSecondary: ThemeColor
        /// Disabled text and hints.
        let textTertiary: ThemeColor
        /// Selected, on, and primary actions.
        let accent: ThemeColor
        /// Text and icons drawn on `accent`.
        let onAccent: ThemeColor
        /// The fill behind a selected row.
        let accentContainer: ThemeColor
        /// Small solid accent fills such as badges.
        let accentStrong: ThemeColor
        /// Decorative gradients behind headers and previews.
        let glow: ThemeColor
        let statusBlocked: ThemeColor
        let statusWorking: ThemeColor
        let statusDone: ThemeColor
        let statusIdle: ThemeColor
        let success: ThemeColor
        let warning: ThemeColor
        let danger: ThemeColor
        let info: ThemeColor
        /// Chrome around terminal content; the terminal's own palette
        /// still comes from its terminal theme.
        let terminalBackground: ThemeColor
        let terminalForeground: ThemeColor

        /// The status tokens as one set.
        var statuses: StatusColors {
            StatusColors(
                blocked: statusBlocked, working: statusWorking, done: statusDone, idle: statusIdle)
        }

        /// The color for an Agent Status, matching herdr's meaning: Blocked
        /// asks for the user, Working runs, Done finished, the rest idles.
        func status(_ status: AgentStatus) -> ThemeColor {
            statuses.status(status)
        }
    }

    let id: String
    let name: String
    let appearance: Appearance
    let colors: Colors
    /// Generated from the status tokens: each status for a surface of the
    /// other appearance. Read it through `status(_:on:)`.
    let contrastingStatus: StatusColors

    /// How strongly a status's wash shows behind its words (pills, chips).
    /// `build_theme.py` checks the contrasting status words against it.
    static let statusWashOpacity = 0.15

    /// `status`'s color on a surface of `appearance`. On the theme's own
    /// appearance that is its status token; on the other one (a light Lock
    /// Screen or terminal under a dark theme, the black Dynamic Island under
    /// a light one) it is the token's hue at a lightness that keeps status
    /// words legible there.
    func status(_ status: AgentStatus, on appearance: Appearance) -> ThemeColor {
        (appearance == self.appearance ? colors.statuses : contrastingStatus).status(status)
    }

    #if !os(watchOS)
    /// `status(_:on:)` for UIKit, resolved against the trait collection's
    /// appearance: for UIKit views, and for surfaces whose appearance only
    /// the system knows, such as the Lock Screen Live Activity. watchOS has
    /// no trait collections; the Watch targets compile this file without it.
    func dynamicStatusColor(_ status: AgentStatus) -> UIColor {
        let dark = self.status(status, on: .dark)
        let light = self.status(status, on: .light)
        return UIColor { traits in
            (traits.userInterfaceStyle == .dark ? dark : light).uiColor
        }
    }
    #endif

    /// The built-in theme with `id`, if this build ships it.
    static func lookup(id: String) -> AgenticoTheme? {
        builtIn.first { $0.id == id }
    }
}

/// The four Agent Status colors as one set.
struct StatusColors: Equatable, Sendable {
    let blocked: ThemeColor
    let working: ThemeColor
    let done: ThemeColor
    /// Idle, Unknown, and any status this build cannot read: none of them
    /// asks for the user.
    let idle: ThemeColor

    func status(_ status: AgentStatus) -> ThemeColor {
        switch status {
        case .blocked: blocked
        case .working: working
        case .done: done
        default: idle
        }
    }
}

/// An sRGB color from `0xRRGGBB`, kept as data so tests can check contrast.
struct ThemeColor: Equatable, Sendable {
    let rgb: UInt32

    init(_ rgb: UInt32) {
        self.rgb = rgb
    }

    var red: Double { Double((rgb >> 16) & 0xFF) / 255 }
    var green: Double { Double((rgb >> 8) & 0xFF) / 255 }
    var blue: Double { Double(rgb & 0xFF) / 255 }

    var color: Color { Color(.sRGB, red: red, green: green, blue: blue) }

    var uiColor: UIColor { UIColor(red: red, green: green, blue: blue, alpha: 1) }

    /// WCAG 2 relative luminance.
    var luminance: Double {
        func linear(_ channel: Double) -> Double {
            channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }

    /// WCAG 2 contrast ratio, 1 to 21.
    func contrast(with other: ThemeColor) -> Double {
        let (high, low) = luminance > other.luminance
            ? (luminance, other.luminance) : (other.luminance, luminance)
        return (high + 0.05) / (low + 0.05)
    }
}

/// Geometry every theme shares, so a new theme only chooses colors.
enum ThemeMetrics {
    /// Cards and grouped sections.
    static let cardRadius: CGFloat = 20
    /// Chips, badges, and rows inside cards.
    static let chipRadius: CGFloat = 10
    /// Distance from the screen edge to cards.
    static let screenInset: CGFloat = 16
    /// Vertical rhythm: 4, 8, 12, 16, 24, 32.
    static let spacing: [CGFloat] = [4, 8, 12, 16, 24, 32]
}

extension EnvironmentValues {
    @Entry var agenticoTheme: AgenticoTheme = .default
}

extension View {
    /// Makes `theme` the environment's theme and applies the parts every
    /// screen inherits: accent tint and the theme's light or dark
    /// appearance. At the app root this is the app's only appearance: it
    /// outranks a `preferredColorScheme` set inside it, and it lands on the
    /// window, so sheets, pushed screens, and the UIKit terminal surfaces
    /// resolve against it too. The themed views are drawn for that
    /// appearance, so nothing inside may override it. `\.colorScheme` is
    /// set from the theme as well, so SwiftUI reads the new appearance in
    /// the same update as the new theme rather than after the window's
    /// traits catch up.
    func agenticoTheme(_ theme: AgenticoTheme) -> some View {
        environment(\.agenticoTheme, theme)
            .environment(\.colorScheme, theme.appearance.colorScheme)
            .tint(theme.colors.accent.color)
            .preferredColorScheme(theme.appearance.colorScheme)
    }

    /// Sets `\.colorScheme` from the environment's theme, at the root of
    /// each presentation (sheet, popover) and Settings page. The root's
    /// `.preferredColorScheme` restyles a sheet's UIKit chrome (its bar and
    /// back button) when the theme changes, but SwiftUI inside the sheet
    /// keeps the color scheme it was presented with: after switching to
    /// Papel on Settings › Theme, the Form's section headers, footers, and
    /// chevrons stayed in the dark system colors on the light canvas, while
    /// the theme's own tokens switched. The theme does reach an open sheet,
    /// so deriving the scheme from it keeps the two in step there too.
    func themeColorScheme() -> some View {
        modifier(ThemeColorScheme())
    }
}

private struct ThemeColorScheme: ViewModifier {
    @Environment(\.agenticoTheme) private var theme

    func body(content: Content) -> some View {
        content.environment(\.colorScheme, theme.appearance.colorScheme)
    }
}
