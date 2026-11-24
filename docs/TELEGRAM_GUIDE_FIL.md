# Paano gamitin ang Telegram bot ng PCF

Para sa lahat ng staff. Isang pahina lang. Hindi kailangan ng computer, cellphone lang.

## Una: i-link ang Telegram mo (isang beses lang)
1. Hingin sa admin ang **link** mo. Padadalhan ka niya sa chat.
2. Pindutin ang link. Mabubuksan ang bot sa Telegram.
3. Pindutin ang **START**. Kapag may mensaheng "Naka-link ka na", tapos na.

## A. Humingi ng budget
1. Pindutin ang 🎤 (mikropono) sa chat ng bot at mag-**voice message**.
2. Sabihin ang **halaga** at **para saan**.
   *Halimbawa: "Kailangan ko ng dalawang libo para sa gasolina ng service."*
3. Basahin ang buod na ibabalik ng bot. Kung tama, pindutin ang **✅ Submit**.

## B. Mag-liquidate (ipakita ang ginastos)
1. **Kunan ng litrato ang resibo.** Dapat kita ang halaga.
2. I-send ito sa bot bilang **larawan** (photo). **Huwag** i-send bilang file.
3. Sa ilalim ng larawan, isulat ang **paliwanag at halaga** — nasa **dulo** ang halaga.
   *Halimbawa:* `gasolina 450`   o   `pamasahe 120`
   - Walang isinulat? Okay lang. Itatanong ng bot kung para saan, at babasahin niya ang halaga sa resibo.
4. **Maraming resibo?** I-send ang bawat resibo, **isang larawan bawat resibo**, na may sariling paliwanag at halaga.
5. Basahin ang listahan na ibabalik ng bot. Tingnan kung tama ang mga halaga at ang kabuuan.
6. Pindutin ang **✅ Submit**. Susuriin ito ng custodian. Aabisuhan ka kapag may sagot na.

### Kung mahaba ang resibo (dalawang larawan ng iisang resibo)
I-send ang pangalawang larawan na may caption na **+** (plus lang). Mapapasama ito sa nakaraang resibo.

### Kung iisang resibo pero maraming binili na magkaiba ang halaga
Pindutin ang **Ayusin ang linya**, piliin ang resibo, tapos **Hatiin ang resibo**. Isulat ang bawat bahagi, isang linya bawat isa:
```
bolt 120
hose 300
```
Dapat umabot sa halaga ng resibo ang kabuuan.

### Kung nagkamali
- **Ayusin ang linya** — palitan ang paliwanag o halaga, magdagdag ng larawan, o tanggalin ang resibo.
- **Palitan ang department** — palitan ang department (isang beses lang itong itatanong, tapos tatandaan na).
- **Kanselahin** o i-type ang /cancel — itigil ang ginagawa. Walang mababago sa advance mo.

## Madalas na tanong
- **Hindi sumasagot ang bot?** Hintayin ang ilang segundo. Kung wala pa rin, ulitin. Kung hindi pa rin, sabihan ang admin.
- **"Walang advance na kailangang i-liquidate"?** Wala kang advance na naghihintay. Itanong sa custodian.
- **"Nasimulan na sa website"?** Tapusin ito sa website: pcf.dryveph.io.
- **Pwede bang i-edit pagkatapos mag-Submit?** Hindi. Kung may mali, ibabalik ito ng custodian sa iyo.
- **Hindi ko makita ang mga utos?** Pindutin ang **Menu** sa ibabang kaliwa ng chat: Liquidate, Help, Cancel.

## Para sa admin
- Mag-link ng bawat tao: **Administration → Telegram → Make link**, tapos ipadala ang link.
- Isang beses, pindutin ang **Connect the bot to this site** sa Telegram page (pindutin ulit pagkatapos ng update na ito) para lumabas ang Menu button sa chat.
- Sa unang linggo, subukan muna sa isa o dalawang taong sanay, bago ang lahat.
