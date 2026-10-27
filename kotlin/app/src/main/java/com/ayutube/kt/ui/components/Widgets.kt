package com.ayutube.kt.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ayutube.kt.R
import com.ayutube.kt.ui.theme.Ay
import com.ayutube.kt.ui.theme.Sans
import com.ayutube.kt.ui.theme.Script

/** Brand mark and the word "ayutube" in script, like the web header. */
@Composable
fun BrandHeader() {
    Column(Modifier.fillMaxWidth().background(Ay.Ink)) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Image(painterResource(R.drawable.brand_mark), contentDescription = null, modifier = Modifier.width(36.dp))
            Spacer(Modifier.width(10.dp))
            Text("ayutube", fontFamily = Script, fontSize = 34.sp, modifier = Modifier.padding(bottom = 4.dp))
        }
        HorizontalDivider(color = Ay.Steel)
    }
}

enum class Tab(val label: String, val icon: ImageVector) {
    Explore("Explore", AyIcons.Explore),
    Library("Library", AyIcons.Library),
    Account("Account", AyIcons.Account)
}

/** Bottom tabs: the active one gets a pink bar on top, as on the web. */
@Composable
fun AyTabBar(current: Tab, onSelect: (Tab) -> Unit) {
    Column(Modifier.fillMaxWidth().background(Ay.Ink).navigationBarsPadding()) {
        HorizontalDivider(color = Ay.Steel)
        Row(Modifier.fillMaxWidth()) {
            for (tab in Tab.entries) {
                val active = tab == current

                Box(
                    Modifier.weight(1f).height(60.dp).clickable { onSelect(tab) },
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        Modifier.align(Alignment.TopCenter).fillMaxWidth().height(3.dp)
                            .background(if (active) Ay.Pink else Color.Transparent)
                    )
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            tab.icon,
                            contentDescription = null,
                            tint = if (active) Ay.Paper else Ay.Fog,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            tab.label,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (active) Ay.Paper else Ay.Fog
                        )
                    }
                }
            }
        }
    }
}

/** Square search box with a pink Search button. */
@Composable
fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    onSearch: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier.fillMaxWidth().height(52.dp).background(Ay.Slate).border(1.dp, Ay.Steel),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            AyIcons.Search,
            contentDescription = null,
            tint = Ay.Fog,
            modifier = Modifier.padding(start = 14.dp).size(20.dp)
        )
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(fontFamily = Sans, fontSize = 17.sp, color = Ay.Paper),
            cursorBrush = SolidColor(Ay.Pink),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) Text("Search videos", color = Ay.Dim, fontSize = 17.sp)
                    inner()
                }
            }
        )
        Box(
            Modifier.fillMaxHeight().background(Ay.Pink).clickable(onClick = onSearch).padding(horizontal = 22.dp),
            contentAlignment = Alignment.Center
        ) {
            Text("Search", color = Ay.Ink, fontWeight = FontWeight.Bold)
        }
    }
}

/** Text tabs with a pink underline on the active one (categories, library sections). */
@Composable
fun TabStrip(labels: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(26.dp)) {
            itemsIndexed(labels) { index, label ->
                val active = index == selected

                Column(
                    Modifier.width(IntrinsicSize.Max).clickable { onSelect(index) }.padding(top = 14.dp)
                ) {
                    Text(
                        label,
                        fontSize = 17.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.SemiBold,
                        color = if (active) Ay.Paper else Ay.Fog,
                        maxLines = 1
                    )
                    Spacer(Modifier.height(10.dp))
                    Box(
                        Modifier.fillMaxWidth().height(3.dp).background(if (active) Ay.Pink else Color.Transparent)
                    )
                }
            }
        }
        HorizontalDivider(color = Ay.Steel)
    }
}

@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.fillMaxWidth().background(Ay.Slate).border(1.dp, Ay.Steel).padding(20.dp)
    ) {
        content()
    }
}

@Composable
fun PanelTitle(text: String) {
    Text(text, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))
}

@Composable
fun SectionHead(title: String, action: String? = null, onAction: () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().padding(top = 26.dp, bottom = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)

        if (action != null) {
            Text(action, color = Ay.Bone, fontSize = 13.sp, modifier = Modifier.clickable(onClick = onAction))
        }
    }
}

/** The web's square on/off switch. */
@Composable
fun SwitchRow(title: String, copy: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f).padding(end = 16.dp)) {
            Text(title, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            Text(copy, color = Ay.Fog, fontSize = 15.sp)
        }
        Box(
            Modifier.width(56.dp).height(40.dp).background(Ay.Ink)
                .border(1.5.dp, if (checked) Ay.Pink else Ay.Steel)
        ) {
            Box(
                Modifier.offset(x = if (checked) 28.dp else 4.dp, y = 4.dp).size(30.dp, 30.dp)
                    .background(if (checked) Ay.Pink else Ay.Fog)
            )
        }
    }
}

@Composable
fun AyButton(text: String, onClick: () -> Unit, primary: Boolean = false, modifier: Modifier = Modifier, danger: Boolean = false) {
    val shape = if (primary) Modifier.background(Ay.Pink) else Modifier.border(1.dp, Ay.Steel)

    Box(
        modifier.then(shape).clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text,
            maxLines = 1,
            softWrap = false,
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            color = when {
                primary -> Ay.Ink
                danger -> Ay.Pink
                else -> Ay.Paper
            }
        )
    }
}

@Composable
fun AyChip(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.border(1.dp, if (selected) Ay.Pink else Ay.Steel)
            .background(if (selected) Ay.Pink.copy(alpha = 0.12f) else Color.Transparent)
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = if (selected) Ay.Paper else Ay.Fog)
    }
}
