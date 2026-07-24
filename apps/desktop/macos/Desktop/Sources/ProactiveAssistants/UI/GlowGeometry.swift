import AppKit

enum GlowEdge {
  case top
  case bottom
  case left
  case right
}

enum GlowGeometry {
  static func globalAppKitFrame(topLeftFrame frame: CGRect) -> CGRect {
    let flipMaxY = NSScreen.screens.first?.frame.maxY ?? NSScreen.main?.frame.maxY ?? 0
    return CGRect(
      x: frame.minX,
      y: flipMaxY - frame.minY - frame.height,
      width: frame.width,
      height: frame.height
    )
  }

  static func edgeFrame(
    for edge: GlowEdge,
    around targetRect: CGRect,
    thickness: CGFloat,
    overlap: CGFloat
  ) -> CGRect {
    switch edge {
    case .top:
      return CGRect(
        x: targetRect.minX - thickness,
        y: targetRect.maxY - overlap,
        width: targetRect.width + thickness * 2,
        height: thickness + overlap
      )
    case .bottom:
      return CGRect(
        x: targetRect.minX - thickness,
        y: targetRect.minY - thickness,
        width: targetRect.width + thickness * 2,
        height: thickness + overlap
      )
    case .left:
      return CGRect(
        x: targetRect.minX - thickness,
        y: targetRect.minY - thickness,
        width: thickness + overlap,
        height: targetRect.height + thickness * 2
      )
    case .right:
      return CGRect(
        x: targetRect.maxX - overlap,
        y: targetRect.minY - thickness,
        width: thickness + overlap,
        height: targetRect.height + thickness * 2
      )
    }
  }
}
