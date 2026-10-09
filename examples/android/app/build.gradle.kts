plugins { id("com.android.application") }
android {
    namespace = "com.leepokai.piwasm"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.leepokai.piwasm.example"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.2.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
dependencies { implementation("androidx.webkit:webkit:1.12.1") }
