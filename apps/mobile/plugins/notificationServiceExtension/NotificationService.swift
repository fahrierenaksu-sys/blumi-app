import Intents
import UserNotifications

/// Blumi notification service extension.
///
/// Chat message and room invite pushes arrive with mutable-content and a
/// sealed link to the sender's chibi picture (`senderImage` in the Expo data
/// dictionary, `userInfo["body"]`). The extension downloads it and shows the
/// push as an iOS Communication Notification: the picture becomes the round
/// sender avatar, like iMessage. If iOS refuses the communication update (for
/// example without the Communication Notifications capability), the picture
/// is attached as a thumbnail instead. Any failure delivers the push as sent.
final class NotificationService: UNNotificationServiceExtension {
  private static let maxImageBytes = 1_000_000
  private static let downloadTimeout: TimeInterval = 8

  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttemptContent: UNMutableNotificationContent?
  private var downloadTask: URLSessionDataTask?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    bestAttemptContent = content
    guard let imageURL = Self.senderImageURL(in: content.userInfo) else {
      finish(with: content)
      return
    }

    var urlRequest = URLRequest(url: imageURL)
    urlRequest.timeoutInterval = Self.downloadTimeout
    urlRequest.cachePolicy = .returnCacheDataElseLoad
    downloadTask = URLSession.shared.dataTask(with: urlRequest) { [weak self] data, response, _ in
      guard let self else { return }
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard status == 200, let data, !data.isEmpty, data.count <= Self.maxImageBytes else {
        self.finish(with: content)
        return
      }
      self.finish(with: Self.present(content, imageData: data))
    }
    downloadTask?.resume()
  }

  override func serviceExtensionTimeWillExpire() {
    downloadTask?.cancel()
    if let bestAttemptContent { finish(with: bestAttemptContent) }
  }

  private func finish(with content: UNNotificationContent) {
    guard let handler = contentHandler else { return }
    contentHandler = nil
    handler(content)
  }

  /// The Expo data dictionary is `userInfo["body"]` (a dictionary, or JSON text from older senders).
  private static func senderImageURL(in userInfo: [AnyHashable: Any]) -> URL? {
    var data = userInfo["body"] as? [String: Any]
    if data == nil, let text = userInfo["body"] as? String, let json = text.data(using: .utf8) {
      data = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any]
    }
    guard let value = data?["senderImage"] as? String,
          let url = URL(string: value),
          url.scheme == "https" else { return nil }
    return url
  }

  private static func present(_ content: UNMutableNotificationContent, imageData: Data) -> UNNotificationContent {
    if let communication = communicationContent(content, image: INImage(imageData: imageData)) {
      return communication
    }
    if let attachment = thumbnailAttachment(imageData) {
      content.attachments = [attachment]
    }
    return content
  }

  /// The sender as an INPerson with the picture; iOS draws it as the round avatar.
  private static func communicationContent(_ content: UNMutableNotificationContent, image: INImage) -> UNNotificationContent? {
    let conversation = content.threadIdentifier.isEmpty ? "blumi" : content.threadIdentifier
    let sender = INPerson(
      personHandle: INPersonHandle(value: conversation, type: .unknown),
      nameComponents: nil,
      displayName: content.title,
      image: image,
      contactIdentifier: nil,
      customIdentifier: conversation
    )
    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: nil,
      conversationIdentifier: conversation,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )
    intent.setImage(image, forParameterNamed: \.sender)
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate(completion: nil)
    return try? content.updating(from: intent)
  }

  private static func thumbnailAttachment(_ imageData: Data) -> UNNotificationAttachment? {
    let file = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathExtension("png")
    do {
      try imageData.write(to: file)
      return try UNNotificationAttachment(identifier: "sender", url: file, options: nil)
    } catch {
      return nil
    }
  }
}
