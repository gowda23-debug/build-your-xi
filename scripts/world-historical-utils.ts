import fs from "node:fs";
import path from "node:path";

export type RegisterPerson = {
  identifier: string;
  name: string;
  uniqueName: string;
  keyCricketArchive: string | null;
};

export type WorldRegister = {
  peopleById: Map<string, RegisterPerson>;
  cricketArchiveToId: Map<string, string>;
  nameToIds: Map<string, Set<string>>;
};

const REGISTER_DIRECTORY =
  path.join(
    process.cwd(),
    "scripts",
    "data",
    "world",
    "register"
  );

function fail(message: string): never {
  throw new Error(
    `[WORLD REGISTER] ${message}`
  );
}

function parseCsv(
  input: string
): string[][] {
  const rows: string[][] = [];

  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char =
      input[i];

    const next =
      input[i + 1];

    if (char === '"') {
      if (
        quoted &&
        next === '"'
      ) {
        field += '"';
        i++;
        continue;
      }

      quoted = !quoted;
      continue;
    }

    if (
      char === "," &&
      !quoted
    ) {
      row.push(field);
      field = "";
      continue;
    }

    if (
      (char === "\n" ||
        char === "\r") &&
      !quoted
    ) {
      if (
        char === "\r" &&
        next === "\n"
      ) {
        i++;
      }

      row.push(field);
      field = "";

      if (
        row.some(
          (value) =>
            value.length > 0
        )
      ) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);

  if (
    row.some(
      (value) =>
        value.length > 0
    )
  ) {
    rows.push(row);
  }

  return rows;
}

function readFile(
  fileName: string
): string {
  const filePath =
    path.join(
      REGISTER_DIRECTORY,
      fileName
    );

  if (
    !fs.existsSync(filePath)
  ) {
    fail(
      `Missing register file: ${filePath}. Run data:sync-world-identities first.`
    );
  }

  const value =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  if (!value.trim()) {
    fail(
      `Register file is empty: ${filePath}`
    );
  }

  return value;
}

export function normalizePersonName(
  value: string
): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/^[*+#\s]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function loadWorldRegister(): WorldRegister {
  const peopleRows =
    parseCsv(
      readFile("people.csv")
    );

  const namesRows =
    parseCsv(
      readFile("names.csv")
    );

  if (
    peopleRows.length < 2
  ) {
    fail(
      "people.csv contains no player records."
    );
  }

  const header =
    peopleRows[0];

  const columnIndex =
    new Map<string, number>();

  header.forEach(
    (name, index) => {
      columnIndex.set(
        name.trim(),
        index
      );
    }
  );

  const requiredColumns = [
    "identifier",
    "name",
    "unique_name",
    "key_cricketarchive",
  ];

  for (const column of requiredColumns) {
    if (
      !columnIndex.has(column)
    ) {
      fail(
        `people.csv is missing required column "${column}".`
      );
    }
  }

  const peopleById =
    new Map<
      string,
      RegisterPerson
    >();

  const cricketArchiveToId =
    new Map<string, string>();

  const nameToIds =
    new Map<
      string,
      Set<string>
    >();

  for (
    const row of
    peopleRows.slice(1)
  ) {
    const identifier =
      row[
        columnIndex.get(
          "identifier"
        )!
      ]?.trim();

    const name =
      row[
        columnIndex.get(
          "name"
        )!
      ]?.trim();

    const uniqueName =
      row[
        columnIndex.get(
          "unique_name"
        )!
      ]?.trim();

    const keyCricketArchive =
      row[
        columnIndex.get(
          "key_cricketarchive"
        )!
      ]?.trim() || null;

    if (
      !identifier ||
      !/^[0-9a-f]{8}$/i.test(
        identifier
      ) ||
      !name
    ) {
      continue;
    }

    const person: RegisterPerson = {
      identifier:
        identifier.toLowerCase(),
      name,
      uniqueName:
        uniqueName || name,
      keyCricketArchive,
    };

    peopleById.set(
      person.identifier,
      person
    );

    const normalized =
      normalizePersonName(
        name
      );

    const ids =
      nameToIds.get(
        normalized
      ) ??
      new Set<string>();

    ids.add(
      person.identifier
    );

    nameToIds.set(
      normalized,
      ids
    );
    // Index unique_name too. It may contain additional parts of a player's
    // name that are needed to interpret initials in historical scorecards.
    const normalizedUniqueName = normalizePersonName(
      person.uniqueName
    );

    if (
      normalizedUniqueName &&
      normalizedUniqueName !== normalized
    ) {
      const uniqueNameIds =
        nameToIds.get(normalizedUniqueName) ??
        new Set<string>();

      uniqueNameIds.add(person.identifier);

      nameToIds.set(
        normalizedUniqueName,
        uniqueNameIds
      );
    }

    if (
      keyCricketArchive
    ) {
      if (
        cricketArchiveToId.has(
          keyCricketArchive
        ) &&
        cricketArchiveToId.get(
          keyCricketArchive
        ) !==
        person.identifier
      ) {
        fail(
          `CricketArchive identifier ${keyCricketArchive} maps to multiple Cricsheet IDs.`
        );
      }

      cricketArchiveToId.set(
        keyCricketArchive,
        person.identifier
      );
    }
  }

  if (
    namesRows.length >= 2
  ) {
    const nameHeader =
      namesRows[0];

    const identifierIndex =
      nameHeader.indexOf(
        "identifier"
      );

    const nameIndex =
      nameHeader.indexOf(
        "name"
      );

    if (
      identifierIndex >= 0 &&
      nameIndex >= 0
    ) {
      for (
        const row of
        namesRows.slice(1)
      ) {
        const identifier =
          row[
            identifierIndex
          ]?.trim()
            .toLowerCase();

        const name =
          row[
            nameIndex
          ]?.trim();

        if (
          !identifier ||
          !name ||
          !peopleById.has(
            identifier
          )
        ) {
          continue;
        }

        const normalized =
          normalizePersonName(
            name
          );

        const ids =
          nameToIds.get(
            normalized
          ) ??
          new Set<string>();

        ids.add(
          identifier
        );

        nameToIds.set(
          normalized,
          ids
        );
      }
    }
  }

  return {
    peopleById,
    cricketArchiveToId,
    nameToIds,
  };
}

export function resolveRegisterName(
  register: WorldRegister,
  rawName: string
): RegisterPerson {
  const normalized = normalizePersonName(rawName);

  if (!normalized) {
    fail("Cannot resolve an empty player name.");
  }

  function getPerson(identifier: string): RegisterPerson {
    const person = register.peopleById.get(identifier);

    if (!person) {
      fail(
        `Register ID ${identifier} was referenced but no people.csv record exists.`
      );
    }

    return person;
  }

  function describeCandidates(
    identifiers: Iterable<string>
  ): string {
    return [...identifiers]
      .map((identifier) => {
        const person = register.peopleById.get(identifier);

        return person
          ? `${person.name} [${person.identifier}]`
          : identifier;
      })
      .join(", ");
  }

  // 1. Exact matching takes priority.
  const exactIds = register.nameToIds.get(normalized);

  if (exactIds?.size === 1) {
    return getPerson([...exactIds][0]);
  }

  if (exactIds && exactIds.size > 1) {
    fail(
      `Ambiguous exact player name "${rawName}". Candidates: ` +
      describeCandidates(exactIds) +
      ". A reviewed identity mapping is required."
    );
  }

  // 2. Try initials and shortened-name matching across registered names
  // and aliases. Each alias remains linked to its canonical player ID.
  const matchingIds = new Set<string>();

  for (const [alias, identifiers] of register.nameToIds) {
    if (matchesRegisterNameReference(alias, rawName)) {
      for (const identifier of identifiers) {
        matchingIds.add(identifier);
      }
    }
  }

  if (matchingIds.size === 1) {
    return getPerson([...matchingIds][0]);
  }

  if (matchingIds.size > 1) {
    fail(
      `Ambiguous abbreviated player name "${rawName}". Candidates: ` +
      describeCandidates(matchingIds) +
      ". Do not select a player automatically; resolve this reference " +
      "using the relevant match, team and source scorecard."
    );
  }

  // 3. Never silently invent an identity when the register cannot resolve it.
  fail(
    `Unable to resolve player name "${rawName}" using exact or abbreviated ` +
    "Cricsheet Register matching. Check the source spelling and registered " +
    "aliases; add a reviewed source-specific mapping if necessary."
  );
}

/**
 * Matches historical scorecard names against a registered name or alias.
 *
 * Supported examples:
 *   S Madan Lal  -> Sharma Madan Lal
 *   Madan Lal    -> Sharma Madan Lal
 *   M Amarnath   -> Mohinder Amarnath
 *   S Abid Ali   -> Syed Abid Ali
 *   DL Amiss     -> a matching registered full name containing
 *                   the corresponding leading-name initials
 *
 * This function only determines whether names are compatible.
 * resolveRegisterName() still requires exactly one matching player.
 */
export function matchesRegisterNameReference(
  candidateName: string,
  rawName: string
): boolean {
  function tokens(value: string): string[] {
    return value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u00a0/g, " ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  const candidateTokens = tokens(candidateName);
  const referenceTokens = tokens(rawName);

  if (
    candidateTokens.length === 0 ||
    referenceTokens.length === 0
  ) {
    return false;
  }

  const candidate = candidateTokens.join(" ");
  const reference = referenceTokens.join(" ");

  if (candidate === reference) {
    return true;
  }

  // Match from the end so that surnames and remaining name parts must
  // agree. This also permits a scorecard to omit a leading given name.
  function matchFromEnd(
    candidateIndex: number,
    referenceIndex: number
  ): boolean {
    if (referenceIndex < 0) {
      return true;
    }

    if (candidateIndex < 0) {
      return false;
    }

    const candidateToken = candidateTokens[candidateIndex];
    const referenceToken = referenceTokens[referenceIndex];

    // Exact token match.
    if (
      candidateToken === referenceToken &&
      matchFromEnd(candidateIndex - 1, referenceIndex - 1)
    ) {
      return true;
    }

    // A single initial must agree with the start of the corresponding name.
    if (
      referenceToken.length === 1 &&
      candidateToken.startsWith(referenceToken) &&
      matchFromEnd(candidateIndex - 1, referenceIndex - 1)
    ) {
      return true;
    }

    // Historical scorecards sometimes combine initials, for example
    // "DL Amiss" for a full name containing the initials D.L.
    // Only use this rule for the leading reference token.
    if (
      referenceIndex === 0 &&
      referenceToken.length > 1
    ) {
      const leadingInitials = candidateTokens
        .slice(0, candidateIndex + 1)
        .map((token) => token[0])
        .join("");

      if (leadingInitials === referenceToken) {
        return true;
      }
    }

    return false;
  }

  return matchFromEnd(
    candidateTokens.length - 1,
    referenceTokens.length - 1
  );
}