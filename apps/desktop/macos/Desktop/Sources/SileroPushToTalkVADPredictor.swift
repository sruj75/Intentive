import Foundation
import IntentiveDesktopCore

public final class SileroPushToTalkVADPredictor: PushToTalkVADPredictor {
  private let model: SileroVADModel

  public init?() {
    guard let model = SileroVADModel() else { return nil }
    self.model = model
  }

  public func resetStates() {
    model.resetStates()
  }

  public func predict(_ samples: [Float]) -> Float {
    model.predict(samples)
  }
}
