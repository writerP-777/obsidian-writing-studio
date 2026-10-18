// A compact Chicago notes-bibliography style for Pandoc's citeproc, written
// for this plugin so the Notes setting works on PDF, DOCX, and RTF without
// shipping the 240 KB community style. It mirrors chicago.ts: full note on
// first citation, short note after, bibliography sorted by author. Writers
// who need every CMOS rule can point the custom style setting at the full
// community file.

export const CHICAGO_NOTES_CSL = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0" demote-non-dropping-particle="display-and-sort" page-range-format="chicago" default-locale="en-US">
  <info>
    <title>Chicago notes (Writing Studio compact)</title>
    <id>https://github.com/writerP-777/obsidian-writing-studio/chicago-notes-compact</id>
    <author><name>Writing Studio</name></author>
    <category citation-format="note"/>
    <category field="generic-base"/>
    <summary>Chicago notes and bibliography, reduced to the source types a nonfiction manuscript cites.</summary>
    <updated>2026-10-18T00:00:00+00:00</updated>
  </info>
  <macro name="author-note">
    <names variable="author">
      <name and="text" delimiter=", " delimiter-precedes-last="contextual"/>
      <substitute>
        <names variable="editor">
          <name and="text" delimiter=", " delimiter-precedes-last="contextual"/>
          <label form="short" prefix=", "/>
        </names>
      </substitute>
    </names>
  </macro>
  <macro name="author-short">
    <names variable="author">
      <name form="short" and="text" delimiter=", " delimiter-precedes-last="contextual"/>
      <substitute>
        <names variable="editor"><name form="short" and="text" delimiter=", " delimiter-precedes-last="contextual"/></names>
      </substitute>
    </names>
  </macro>
  <macro name="author-bib">
    <names variable="author">
      <name and="text" name-as-sort-order="first" sort-separator=", " delimiter=", " delimiter-precedes-last="always"/>
      <substitute>
        <names variable="editor">
          <name and="text" name-as-sort-order="first" sort-separator=", " delimiter=", " delimiter-precedes-last="always"/>
          <label form="short" prefix=", "/>
        </names>
      </substitute>
    </names>
  </macro>
  <macro name="editor-note">
    <choose>
      <if variable="author editor" match="all">
        <names variable="editor">
          <label form="short" suffix=" "/>
          <name and="text" delimiter=", " delimiter-precedes-last="contextual"/>
        </names>
      </if>
    </choose>
  </macro>
  <macro name="editor-bib">
    <choose>
      <if variable="author editor" match="all">
        <names variable="editor">
          <label form="verb" suffix=" "/>
          <name and="text" delimiter=", " delimiter-precedes-last="contextual"/>
        </names>
      </if>
    </choose>
  </macro>
  <macro name="title">
    <choose>
      <if type="book report" match="any"><text variable="title" font-style="italic"/></if>
      <else><text variable="title" quotes="true"/></else>
    </choose>
  </macro>
  <macro name="title-short">
    <choose>
      <if type="book report" match="any"><text variable="title" form="short" font-style="italic"/></if>
      <else><text variable="title" form="short" quotes="true"/></else>
    </choose>
  </macro>
  <macro name="edition">
    <choose>
      <if is-numeric="edition"><group delimiter=" "><number variable="edition" form="ordinal"/><text term="edition" form="short"/></group></if>
      <else><text variable="edition"/></else>
    </choose>
  </macro>
  <macro name="year"><date variable="issued"><date-part name="year"/></date></macro>
  <macro name="imprint"><group delimiter=": "><text variable="publisher-place"/><text variable="publisher"/></group></macro>
  <macro name="imprint-year"><group delimiter=", "><text macro="imprint"/><text macro="year"/></group></macro>
  <macro name="access"><text variable="URL"/></macro>
  <macro name="doi-or-url">
    <choose>
      <if variable="DOI"><text variable="DOI" prefix="https://doi.org/"/></if>
      <else><text variable="URL"/></else>
    </choose>
  </macro>
  <macro name="accessed">
    <group delimiter=" "><text term="accessed" text-case="capitalize-first"/><date variable="accessed" form="text"/></group>
  </macro>
  <macro name="locator">
    <choose>
      <if locator="page"><text variable="locator"/></if>
      <else><group delimiter=" "><label variable="locator" form="short"/><text variable="locator"/></group></else>
    </choose>
  </macro>
  <macro name="locator-or-pages">
    <choose>
      <if variable="locator"><text macro="locator"/></if>
      <else><text variable="page"/></else>
    </choose>
  </macro>
  <macro name="journal-volume">
    <group delimiter=", ">
      <group delimiter=" "><text variable="container-title" font-style="italic"/><text variable="volume"/></group>
      <group delimiter=" "><text term="issue" form="short"/><text variable="issue"/></group>
    </group>
  </macro>
  <macro name="note-full">
    <choose>
      <if type="chapter">
        <group delimiter=", ">
          <text macro="author-note"/>
          <text macro="title"/>
          <group delimiter=" "><text term="in"/><text variable="container-title" font-style="italic"/></group>
          <text macro="editor-note"/>
        </group>
        <text macro="imprint-year" prefix=" (" suffix=")"/>
        <text macro="locator-or-pages" prefix=", "/>
      </if>
      <else-if type="article-journal">
        <group delimiter=", ">
          <text macro="author-note"/>
          <text macro="title"/>
          <text macro="journal-volume"/>
        </group>
        <text macro="year" prefix=" (" suffix=")"/>
        <text macro="locator-or-pages" prefix=": "/>
      </else-if>
      <else-if type="article-magazine article-newspaper" match="any">
        <group delimiter=", ">
          <text macro="author-note"/>
          <text macro="title"/>
          <text variable="container-title" font-style="italic"/>
          <text macro="year"/>
          <text macro="locator"/>
        </group>
      </else-if>
      <else-if type="webpage post post-weblog" match="any">
        <group delimiter=", ">
          <text macro="author-note"/>
          <text macro="title"/>
          <text variable="container-title"/>
          <text macro="year"/>
          <text macro="access"/>
        </group>
      </else-if>
      <else-if type="thesis">
        <group delimiter=", ">
          <text macro="author-note"/>
          <text macro="title"/>
        </group>
        <group delimiter=", " prefix=" (" suffix=")">
          <text variable="genre"/>
          <text variable="publisher"/>
          <text macro="year"/>
        </group>
        <text macro="locator" prefix=", "/>
      </else-if>
      <else>
        <group delimiter=", ">
          <text macro="author-note"/>
          <text macro="title"/>
          <text macro="edition"/>
          <text macro="editor-note"/>
        </group>
        <text macro="imprint-year" prefix=" (" suffix=")"/>
        <text macro="locator" prefix=", "/>
      </else>
    </choose>
  </macro>
  <macro name="note-short">
    <group delimiter=", ">
      <text macro="author-short"/>
      <text macro="title-short"/>
      <text macro="locator"/>
    </group>
  </macro>
  <citation et-al-min="4" et-al-use-first="1" disambiguate-add-names="true">
    <layout suffix="." delimiter="; ">
      <choose>
        <if position="subsequent"><text macro="note-short"/></if>
        <else><text macro="note-full"/></else>
      </choose>
    </layout>
  </citation>
  <bibliography hanging-indent="true" et-al-min="11" et-al-use-first="7" subsequent-author-substitute="———">
    <sort>
      <key macro="author-bib"/>
      <key macro="year"/>
      <key variable="title"/>
    </sort>
    <layout suffix=".">
      <choose>
        <if type="chapter">
          <group delimiter=". ">
            <text macro="author-bib"/>
            <text macro="title"/>
            <group delimiter=", ">
              <group delimiter=" "><text term="in" text-case="capitalize-first"/><text variable="container-title" font-style="italic"/></group>
              <text macro="editor-bib"/>
              <text variable="page"/>
            </group>
            <text macro="imprint-year"/>
            <text macro="doi-or-url"/>
          </group>
        </if>
        <else-if type="article-journal">
          <group delimiter=". ">
            <text macro="author-bib"/>
            <text macro="title"/>
            <group>
              <text macro="journal-volume"/>
              <text macro="year" prefix=" (" suffix=")"/>
              <text variable="page" prefix=": "/>
            </group>
            <text macro="doi-or-url"/>
          </group>
        </else-if>
        <else-if type="article-magazine article-newspaper" match="any">
          <group delimiter=". ">
            <text macro="author-bib"/>
            <text macro="title"/>
            <group delimiter=", "><text variable="container-title" font-style="italic"/><text macro="year"/></group>
            <text macro="doi-or-url"/>
          </group>
        </else-if>
        <else-if type="webpage post post-weblog" match="any">
          <group delimiter=". ">
            <text macro="author-bib"/>
            <text macro="title"/>
            <group delimiter=", "><text variable="container-title"/><text macro="year"/></group>
            <text macro="accessed"/>
            <text macro="access"/>
          </group>
        </else-if>
        <else-if type="thesis">
          <group delimiter=". ">
            <text macro="author-bib"/>
            <text macro="title"/>
            <group delimiter=", "><text variable="genre"/><text variable="publisher"/><text macro="year"/></group>
            <text macro="doi-or-url"/>
          </group>
        </else-if>
        <else>
          <group delimiter=". ">
            <text macro="author-bib"/>
            <text macro="title"/>
            <text macro="edition"/>
            <text macro="editor-bib"/>
            <text macro="imprint-year"/>
            <text macro="doi-or-url"/>
          </group>
        </else>
      </choose>
    </layout>
  </bibliography>
</style>
`;
