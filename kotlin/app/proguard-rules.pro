# NewPipeExtractor and what it loads by name
-keep class org.schabi.newpipe.extractor.** { *; }
-keep class org.mozilla.javascript.** { *; }
-keep class org.mozilla.classfile.ClassFileWriter
-keep class com.grack.nanojson.** { *; }
-keep class org.jsoup.** { *; }
-keep class * extends com.google.protobuf.GeneratedMessageLite { *; }
-dontwarn org.mozilla.javascript.JavaToJSONConverters
-dontwarn org.mozilla.javascript.tools.**
-dontwarn javax.script.**
-dontwarn java.beans.**
-dontwarn jdk.dynalink.**
-dontwarn com.google.protobuf.**

# The app's own code stays as it is (backup/restore and Room read names)
-keep class com.ayutube.kt.** { *; }

-keepattributes Signature,*Annotation*,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-ignorewarnings
