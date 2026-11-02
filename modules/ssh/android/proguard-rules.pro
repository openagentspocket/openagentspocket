# JSch instantiates its ciphers, MACs, key exchanges and signatures by class name.
-keep class com.jcraft.jsch.** { *; }
-dontwarn com.jcraft.jsch.**
-dontwarn com.sun.jna.**
-dontwarn org.apache.logging.log4j.**
-dontwarn org.slf4j.**
-dontwarn org.newsclub.net.unix.**
-dontwarn org.ietf.jgss.**
-dontwarn javax.naming.**
