import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// One version for every platform: package.json. versionCode = major*10000 + minor*100 + patch (0.4.5 -> 405).
@Suppress("UNCHECKED_CAST")
val pkg = JsonSlurper().parse(rootProject.file("../package.json")) as Map<String, Any>
val vegaVersion = pkg["version"] as String
val vegaVersionCode = vegaVersion.split(".").map { it.toInt() }.let { (a, b, c) -> a * 10000 + b * 100 + c }

// The WebView loads the hosted web app, so the relative /api calls, the CSP and the YouTube embed behave exactly as in a
// browser. Override for a staging deployment: ./gradlew assembleDebug -PvegaUrl=https://my-preview.vercel.app
val vegaUrl = (project.findProperty("vegaUrl") as String?) ?: "https://vega-psi-lac.vercel.app"

// Release signing comes from the environment (CI). Without it the release build falls back to the debug key.
val keystorePath: String? = System.getenv("VEGA_KEYSTORE")

android {
    namespace = "dev.vega.android"
    compileSdk = 36

    buildFeatures { buildConfig = true }

    defaultConfig {
        applicationId = "dev.vega.android"
        minSdk = 26
        targetSdk = 36
        versionCode = vegaVersionCode
        versionName = vegaVersion
        buildConfigField("String", "VEGA_URL", "\"$vegaUrl\"")
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("VEGA_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("VEGA_KEY_ALIAS")
                keyPassword = System.getenv("VEGA_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        // installs next to a release build instead of failing to update it
        debug { applicationIdSuffix = ".debug" }
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePath != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { jvmToolchain(17) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.media:media:1.7.0")
}
