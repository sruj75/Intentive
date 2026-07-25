import SwiftUI

enum IntentiveChrome {
    static let windowRadius: CGFloat = 26
    static let cardRadius: CGFloat = 24
    static let sectionRadius: CGFloat = 20
    static let controlRadius: CGFloat = 16
    static let chipRadius: CGFloat = 14
}

private struct IntentivePanelModifier: ViewModifier {
    let fill: Color
    let radius: CGFloat
    let stroke: Color?
    let shadowOpacity: Double
    let shadowRadius: CGFloat
    let shadowY: CGFloat

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(fill)
            )
            .overlay {
                if let stroke {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .stroke(stroke, lineWidth: 1)
                }
            }
            .shadow(color: .black.opacity(shadowOpacity), radius: shadowRadius, x: 0, y: shadowY)
    }
}

extension View {
    func intentivePanel(
        fill: Color = IntentiveColors.backgroundSecondary,
        radius: CGFloat = IntentiveChrome.cardRadius,
        stroke: Color? = IntentiveColors.border.opacity(0.28),
        shadowOpacity: Double = 0.14,
        shadowRadius: CGFloat = 18,
        shadowY: CGFloat = 10
    ) -> some View {
        modifier(
            IntentivePanelModifier(
                fill: fill,
                radius: radius,
                stroke: stroke,
                shadowOpacity: shadowOpacity,
                shadowRadius: shadowRadius,
                shadowY: shadowY
            )
        )
    }

    func intentiveControlSurface(
        fill: Color = IntentiveColors.backgroundTertiary,
        radius: CGFloat = IntentiveChrome.controlRadius,
        stroke: Color? = nil
    ) -> some View {
        modifier(
            IntentivePanelModifier(
                fill: fill,
                radius: radius,
                stroke: stroke,
                shadowOpacity: 0.08,
                shadowRadius: 8,
                shadowY: 4
            )
        )
    }
}
