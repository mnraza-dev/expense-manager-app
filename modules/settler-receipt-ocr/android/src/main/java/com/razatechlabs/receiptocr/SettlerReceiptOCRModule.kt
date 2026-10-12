package com.razatechlabs.receiptocr

import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

class SettlerReceiptOCRModule : Module() {
  private val processing = AtomicBoolean(false)

  private fun localFile(uri: String): File {
    val context = appContext.reactContext ?: throw IllegalStateException("App context unavailable")
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Only private image files are supported" }
    val file = File(parsed.path ?: "").canonicalFile
    val root = context.cacheDir.canonicalFile.path + File.separator
    require(file.path.startsWith(root) && file.isFile && file.length() in 1..(10L * 1024 * 1024)) {
      "Choose a private image no larger than 10 MB"
    }
    return file
  }

  private fun dimensions(file: File): Map<String, Int> {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, options)
    val width = options.outWidth
    val height = options.outHeight
    require(width > 0 && height > 0 && width.toLong() * height <= 24_000_000) {
      "Choose an image of at most 24 megapixels"
    }
    return mapOf("width" to width, "height" to height)
  }

  override fun definition() = ModuleDefinition {
    Name("SettlerReceiptOCR")

    AsyncFunction("imageInfo") { uri: String -> dimensions(localFile(uri)) }

    AsyncFunction("recognize") { uri: String, script: String, promise: Promise ->
      if (!processing.compareAndSet(false, true)) {
        promise.reject("E_OCR_BUSY", "Another receipt is being read. Try again shortly.", null)
        return@AsyncFunction
      }
      try {
        require(script == "latin" || script == "devanagari") { "Unsupported recognition script" }
        val file = localFile(uri)
        dimensions(file)
        val context = appContext.reactContext ?: throw IllegalStateException("App context unavailable")
        val image = InputImage.fromFilePath(context, Uri.fromFile(file))
        val recognizer = if (script == "devanagari") {
          TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())
        } else {
          TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        }
        try {
          recognizer.process(image)
            .addOnSuccessListener { result ->
              val lines = result.textBlocks.flatMap { it.lines }
                .sortedWith(compareBy({ it.boundingBox?.top ?: 0 }, { it.boundingBox?.left ?: 0 }))
                .map { it.text }
              val text = lines.joinToString("\n")
              promise.resolve(mapOf("text" to text.take(20000), "truncated" to (text.length > 20000)))
            }
            .addOnFailureListener {
              promise.reject("E_OCR_READ", "Could not read this image. Try a clearer photo or enter details manually.", null)
            }
            .addOnCompleteListener {
              recognizer.close()
              processing.set(false)
            }
        } catch (error: Exception) {
          recognizer.close()
          throw error
        }
      } catch (error: Exception) {
        processing.set(false)
        promise.reject("E_OCR_IMAGE", "Could not read this private image. Choose a JPEG or PNG of at most 24 megapixels.", null)
      }
    }
  }
}
