import CoreGraphics

public enum DesktopPrimaryWindowPlacement {
  /// Places the first visible presentation independently of the arbitrary
  /// origin AppKit assigned while the window was materialized offscreen.
  ///
  /// The window's established size is preserved. When that size fits, the
  /// frame is centered and clamped wholly inside the current visible screen.
  /// An oversized dimension anchors to the visible-frame origin.
  public static func frameForFirstVisibleShow(
    windowFrame: CGRect,
    visibleFrame: CGRect
  ) -> CGRect {
    let visible = visibleFrame.standardized
    let size = windowFrame.standardized.size
    return CGRect(
      x: centeredOrigin(
        extent: size.width,
        visibleMinimum: visible.minX,
        visibleExtent: visible.width
      ),
      y: centeredOrigin(
        extent: size.height,
        visibleMinimum: visible.minY,
        visibleExtent: visible.height
      ),
      width: size.width,
      height: size.height
    )
  }

  private static func centeredOrigin(
    extent: CGFloat,
    visibleMinimum: CGFloat,
    visibleExtent: CGFloat
  ) -> CGFloat {
    guard extent < visibleExtent else { return visibleMinimum }
    let centered = visibleMinimum + ((visibleExtent - extent) / 2)
    let maximum = visibleMinimum + visibleExtent - extent
    return min(max(centered, visibleMinimum), maximum)
  }
}
