import ExpoModulesCore
import Vision
import ImageIO

public class SettlerReceiptOCRModule: Module {
  private func localURL(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL else {
      throw NSError(domain: "SettlerOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Only private receipt images are supported."])
    }
    let resolved = url.resolvingSymlinksInPath().standardizedFileURL
    let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].resolvingSymlinksInPath().path + "/"
    let temporary = URL(fileURLWithPath: NSTemporaryDirectory()).resolvingSymlinksInPath().path + "/"
    let size = try resolved.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard (resolved.path.hasPrefix(caches) || resolved.path.hasPrefix(temporary)),
      size.isRegularFile == true, let bytes = size.fileSize, bytes > 0, bytes <= 10 * 1024 * 1024 else {
      throw NSError(domain: "SettlerOCR", code: 2, userInfo: [NSLocalizedDescriptionKey: "Choose a private image no larger than 10 MB."])
    }
    return resolved
  }

  private func dimensions(_ url: URL) throws -> [String: Int] {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int,
      width > 0, height > 0, width <= 24000000 / height else {
      throw NSError(domain: "SettlerOCR", code: 3, userInfo: [NSLocalizedDescriptionKey: "Choose an image of at most 24 megapixels."])
    }
    return ["width": width, "height": height]
  }

  public func definition() -> ModuleDefinition {
    Name("SettlerReceiptOCR")
    AsyncFunction("imageInfo") { (uri: String) throws -> [String: Int] in
      return try self.dimensions(self.localURL(uri))
    }
    AsyncFunction("recognize") { (uri: String, script: String) throws -> [String: Any] in
      let url = try self.localURL(uri)
      _ = try self.dimensions(url)
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = false
      let supported = try request.supportedRecognitionLanguages()
      let language = script == "devanagari" ? "hi-IN" : "en-US"
      guard (script == "latin" || script == "devanagari"), supported.contains(language) else {
        throw NSError(domain: "SettlerOCR", code: 4, userInfo: [NSLocalizedDescriptionKey: "This receipt language is unavailable on this device. Try English or enter details manually."])
      }
      request.recognitionLanguages = [language]
      try VNImageRequestHandler(url: url, options: [:]).perform([request])
      let lines = (request.results ?? []).sorted {
        let leftRow = Int(($0.boundingBox.midY * 100).rounded())
        let rightRow = Int(($1.boundingBox.midY * 100).rounded())
        return leftRow == rightRow ? $0.boundingBox.minX < $1.boundingBox.minX : leftRow > rightRow
      }.compactMap { $0.topCandidates(1).first?.string }
      let text = lines.joined(separator: "\n")
      return ["text": String(text.prefix(20000)), "truncated": text.count > 20000]
    }
  }
}
