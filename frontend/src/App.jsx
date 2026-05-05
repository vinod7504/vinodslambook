import { useEffect, useMemo, useState } from "react";
import friendsCover from "./assets/friends-cover.svg";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const ADMIN_USERNAME = "Vinod7504";
const ADMIN_PASSWORD = "Vinodkumar";

const emptyForm = {
  name: "",
  admissionNumber: "",
  nickname: "",
  dob: "",
  phone: "",
  email: "",
  address: "",
  ambition: "",
  bestFriend: "",
  favoriteColor: "",
  favoriteSong: "",
  favoriteMovie: "",
  favoriteFood: "",
  hobby: "",
  dreamPlace: "",
  firstMemory: "",
  funnyMoment: "",
  message: "",
  secretWish: "",
  signature: "",
  photo: "",
  vinodMemoryText: "",
  vinodMemoryFiles: []
};

const MAX_MEMORY_MEDIA_BYTES = 100 * 1024 * 1024;

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeEntryId(name, admissionNumber) {
  return slugify(`${admissionNumber}-${name}`);
}

function normalizeIdentity(value) {
  return value.trim().toLowerCase();
}

function matchesIdentity(entry, identity) {
  return (
    normalizeIdentity(entry.name || "") === normalizeIdentity(identity.name || "") &&
    normalizeIdentity(entry.admissionNumber || "") === normalizeIdentity(identity.admissionNumber || "")
  );
}

async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong. Please try again.");
  }

  return data;
}

function getEntries() {
  return apiRequest("/api/entries");
}

function createEntry(entry) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(entry)) {
    if (key === "vinodMemoryFiles") {
      continue;
    }

    formData.append(key, value || "");
  }

  for (const memoryFile of entry.vinodMemoryFiles) {
    formData.append("vinodMemoryFiles", memoryFile.file, memoryFile.name);
  }

  return apiRequest("/api/entries", {
    method: "POST",
    body: formData
  });
}

function deleteEntry(id, adminCredentials) {
  return apiRequest(`/api/entries/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "X-Admin-Username": adminCredentials.username,
      "X-Admin-Password": adminCredentials.password
    }
  });
}

function Field({ label, name, value, onChange, type = "text", placeholder, readOnly = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        value={value}
        onChange={onChange}
        type={type}
        placeholder={placeholder}
        readOnly={readOnly}
      />
    </label>
  );
}

function TextArea({ label, name, value, onChange, placeholder }) {
  return (
    <label className="field fieldWide">
      <span>{label}</span>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows="3"
      />
    </label>
  );
}

function PhotoPicker({ photo, onPhotoChange }) {
  return (
    <label className="photoPicker">
      <input type="file" accept="image/*" onChange={onPhotoChange} />
      {photo ? (
        <img src={photo} alt="Slam book profile" />
      ) : (
        <span>
          Add
          <strong>Photo</strong>
        </span>
      )}
    </label>
  );
}

function PhotoFrame({ photo }) {
  return (
    <div className="photoFrame">
      {photo ? (
        <img src={photo} alt="Saved slam book profile" />
      ) : (
        <span>
          Saved
          <strong>Photo</strong>
        </span>
      )}
    </div>
  );
}

function formatFileSize(size) {
  if (!size) {
    return "";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getSavedMemoryFiles(entry) {
  if (Array.isArray(entry?.vinodMemoryFiles) && entry.vinodMemoryFiles.length > 0) {
    return entry.vinodMemoryFiles;
  }

  if (entry?.vinodMemoryMedia) {
    return [
      {
        driveFileId: "legacy-memory-media",
        name: entry.vinodMemoryMediaName || "Memory media",
        mimeType: entry.vinodMemoryMediaType || "",
        previewUrl: entry.vinodMemoryMedia
      }
    ];
  }

  return [];
}

function MemoryMediaPicker({ files, onMediaChange, onRemove, onClear }) {
  return (
    <div className="memoryMediaField fieldWide">
      <span>Images or Videos</span>
      <label className={`memoryMediaPicker ${files.length > 0 ? "hasMedia" : ""}`}>
        <input multiple type="file" accept="image/*,video/*" onChange={onMediaChange} />
        <strong>Add Images/Videos</strong>
      </label>
      {files.length > 0 ? (
        <div className="memoryMediaMeta">
          <small>{files.length} file{files.length === 1 ? "" : "s"} selected</small>
          <button className="ghostButton mediaRemoveButton" onClick={onClear} type="button">
            Clear All
          </button>
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="memoryMediaGrid">
          {files.map((memoryFile) => (
            <article className="memoryMediaTile" key={memoryFile.id}>
              {memoryFile.type.startsWith("video/") ? (
                <video src={memoryFile.previewUrl} controls />
              ) : (
                <img src={memoryFile.previewUrl} alt={memoryFile.name} />
              )}
              <div>
                <strong>{memoryFile.name}</strong>
                <small>{formatFileSize(memoryFile.size)}</small>
              </div>
              <button
                className="ghostButton mediaRemoveButton"
                onClick={() => onRemove(memoryFile.id)}
                type="button"
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MemoryMediaDisplay({ entry }) {
  const files = getSavedMemoryFiles(entry);

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="memoryMediaDisplay">
      {files.map((file) => (
        <article className="savedMemoryFile" key={file.driveFileId || file.previewUrl || file.name}>
          {file.previewUrl ? (
            file.mimeType?.startsWith("video/") ? (
              <video src={file.previewUrl} controls />
            ) : (
              <img src={file.previewUrl} alt={file.name || "Memory with Vinod"} />
            )
          ) : file.thumbnailLink ? (
            <img src={file.thumbnailLink} alt={file.name || "Memory with Vinod"} />
          ) : (
            <div className="savedMemoryIcon">{file.mimeType?.startsWith("video/") ? "Video" : "Image"}</div>
          )}
          <div>
            <strong>{file.originalName || file.name || "Memory media"}</strong>
            <small>
              {file.folderName ? `Drive folder: ${file.folderName}` : "Saved memory media"}
              {file.size ? ` - ${formatFileSize(file.size)}` : ""}
            </small>
          </div>
          {file.webViewLink ? (
            <a className="driveLink" href={file.webViewLink} rel="noreferrer" target="_blank">
              Open in Drive
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function DetailValue({ label, value, wide = false, color }) {
  return (
    <div className={`detailValue ${wide ? "detailWide" : ""}`}>
      <span>{label}</span>
      <strong>
        {color ? <i style={{ backgroundColor: color }} /> : null}
        {value || "Not filled"}
      </strong>
    </div>
  );
}

function LoginPage({ mode, values, error, onModeChange, onChange, onSubmit }) {
  return (
    <main className="loginShell">
      <div className="stageBackdrop" />
      <section className="loginBook">
        <img className="loginArtwork" src={friendsCover} alt="Friends standing together" />
        <p className="coverKicker">Friends Forever</p>
        <h1>Slam Book</h1>
        <div className="loginTabs" role="tablist" aria-label="Login role">
          <button
            className={mode === "user" ? "active" : ""}
            onClick={() => onModeChange("user")}
            type="button"
          >
            Login as User
          </button>
          <button
            className={mode === "admin" ? "active" : ""}
            onClick={() => onModeChange("admin")}
            type="button"
          >
            Login as Admin
          </button>
        </div>
        <form className="authForm" onSubmit={onSubmit}>
          {mode === "user" ? (
            <>
              <label className="authField">
                <span>Name</span>
                <input
                  name="name"
                  value={values.name}
                  onChange={onChange}
                  placeholder="Enter your name"
                />
              </label>
              <label className="authField">
                <span>Admission Number</span>
                <input
                  name="admissionNumber"
                  value={values.admissionNumber}
                  onChange={onChange}
                  placeholder="Enter admission number"
                />
              </label>
            </>
          ) : (
            <>
              <label className="authField">
                <span>Username</span>
                <input
                  name="username"
                  value={values.username}
                  onChange={onChange}
                  placeholder="Admin username"
                />
              </label>
              <label className="authField">
                <span>Password</span>
                <input
                  name="password"
                  value={values.password}
                  onChange={onChange}
                  placeholder="Admin password"
                  type="password"
                />
              </label>
            </>
          )}
          {error ? <p className="formError loginError">{error}</p> : null}
          <button className="primaryButton" type="submit">
            Open Slam Book
          </button>
        </form>
      </section>
    </main>
  );
}

function PageProgress({ page }) {
  const isSavedPage = page.startsWith("saved");
  const steps = isSavedPage
    ? [
        ["saved1", "Saved 1"],
        ["saved2", "Saved 2"],
        ["saved3", "Memories"]
      ]
    : [
        ["cover", "Cover"],
        ["page1", "About"],
        ["page2", "Favorites"],
        ["page3", "Memories"]
      ];
  const activeIndex = Math.max(
    0,
    steps.findIndex(([stepPage]) => stepPage === page)
  );

  return (
    <div className="pageProgress" aria-label="Slam book progress">
      {steps.map(([stepPage, label], index) => (
        <span
          className={index <= activeIndex ? "active" : ""}
          aria-current={stepPage === page ? "step" : undefined}
          key={stepPage}
        >
          <i />
          {label}
        </span>
      ))}
    </div>
  );
}

function SessionBar({ session, onLogout }) {
  return (
    <div className="sessionBar">
      <div>
        <span>{session.role === "admin" ? "Admin" : "User"}</span>
        <strong>
          {session.role === "admin"
            ? session.username
            : `${session.name} - ${session.admissionNumber}`}
        </strong>
      </div>
      <button className="ghostButton" onClick={onLogout} type="button">
        Logout
      </button>
    </div>
  );
}

function SavedList({ entries, selectedId, loading, apiError, canDelete, onSelect, onDelete }) {
  return (
    <aside className="savedShelf" aria-label="Saved slam book entries">
      <div className="savedHeader">
        <p>Saved Pages</p>
        <span>{entries.length}</span>
      </div>
      <div className="savedList">
        {loading ? (
          <p className="emptyState">Loading saved pages...</p>
        ) : apiError ? (
          <p className="apiError">{apiError}</p>
        ) : entries.length === 0 ? (
          <p className="emptyState">No pages saved yet.</p>
        ) : (
          entries.map((entry) => (
            <button
              className={`savedEntry ${selectedId === entry.id ? "active" : ""}`}
              key={entry.id}
              onClick={() => onSelect(entry)}
              type="button"
            >
              {entry.photo ? <img src={entry.photo} alt="" /> : <span />}
              <strong>{entry.name}</strong>
              <small>{entry.admissionNumber || "No admission number"}</small>
              <em>{new Date(entry.createdAt).toLocaleDateString()}</em>
            </button>
          ))
        )}
      </div>
      {canDelete && selectedId ? (
        <button className="deleteButton" onClick={onDelete} type="button">
          Delete Selected
        </button>
      ) : null}
    </aside>
  );
}

function Cover({ onOpen, entriesCount }) {
  return (
    <section className="coverPage">
      <div className="coverShine" />
      <div className="coverPattern" />
      <img className="coverArtwork" src={friendsCover} alt="Friends standing arm in arm" />
      <p className="coverKicker">Friends Forever</p>
      <h1>Slam Book</h1>
      <p className="coverSubtitle">Memories, favorites, secrets and smiles</p>
      <button className="primaryButton openBookButton" onClick={onOpen} type="button">
        Open Book
      </button>
      <p className="coverFoot">{entriesCount} saved</p>
    </section>
  );
}

function PageOne({ form, lockIdentity, onChange, onPhotoChange, error, onNext, onBack }) {
  return (
    <section className="paperPage pageOne">
      <PhotoPicker photo={form.photo} onPhotoChange={onPhotoChange} />
      <div className="pageHeading">
        <span>Page 1</span>
        <h2>All About Me</h2>
      </div>
      <div className="formGrid">
        <Field
          label="Full Name"
          name="name"
          value={form.name}
          onChange={onChange}
          placeholder="Your name"
          readOnly={lockIdentity}
        />
        <Field
          label="Admission Number"
          name="admissionNumber"
          value={form.admissionNumber}
          onChange={onChange}
          placeholder="Your admission number"
          readOnly={lockIdentity}
        />
        <Field label="Nickname" name="nickname" value={form.nickname} onChange={onChange} />
        <Field label="Date of Birth" name="dob" value={form.dob} onChange={onChange} type="date" />
        <Field label="Phone" name="phone" value={form.phone} onChange={onChange} type="tel" />
        <Field label="Email" name="email" value={form.email} onChange={onChange} type="email" />
        <Field label="Best Friend" name="bestFriend" value={form.bestFriend} onChange={onChange} />
        <Field label="Ambition" name="ambition" value={form.ambition} onChange={onChange} />
        <Field label="Address" name="address" value={form.address} onChange={onChange} />
      </div>
      {error ? <p className="formError">{error}</p> : null}
      <div className="pageActions">
        <button className="ghostButton" onClick={onBack} type="button">
          Cover
        </button>
        <button className="primaryButton" onClick={onNext} type="button">
          Next Page
        </button>
      </div>
    </section>
  );
}

function PageTwo({ form, onChange, onPhotoChange, onBack, onNext }) {
  return (
    <section className="paperPage pageTwo">
      <PhotoPicker photo={form.photo} onPhotoChange={onPhotoChange} />
      <div className="pageHeading">
        <span>Page 2</span>
        <h2>Favorites & Memories</h2>
      </div>
      <div className="formGrid compact">
        <Field
          label="Favourite Colour"
          name="favoriteColor"
          value={form.favoriteColor}
          onChange={onChange}
          placeholder="Your favourite colour"
        />
        <Field label="Favorite Song" name="favoriteSong" value={form.favoriteSong} onChange={onChange} />
        <Field label="Favorite Movie" name="favoriteMovie" value={form.favoriteMovie} onChange={onChange} />
        <Field label="Favorite Food" name="favoriteFood" value={form.favoriteFood} onChange={onChange} />
        <Field label="Hobby" name="hobby" value={form.hobby} onChange={onChange} />
        <Field label="Dream Place" name="dreamPlace" value={form.dreamPlace} onChange={onChange} />
        <TextArea
          label="Describe me in 3 words"
          name="firstMemory"
          value={form.firstMemory}
          onChange={onChange}
        />
        <TextArea label="Funniest Moment" name="funnyMoment" value={form.funnyMoment} onChange={onChange} />
        <TextArea label="Message For Me" name="message" value={form.message} onChange={onChange} />
        <TextArea label="Secret Wish" name="secretWish" value={form.secretWish} onChange={onChange} />
        <Field label="Signature" name="signature" value={form.signature} onChange={onChange} />
      </div>
      <div className="pageActions">
        <button className="ghostButton" onClick={onBack} type="button">
          Previous
        </button>
        <button className="primaryButton" onClick={onNext} type="button">
          Next Page
        </button>
      </div>
    </section>
  );
}

function PageThree({
  form,
  error,
  success,
  saving,
  onBack,
  onChange,
  onMediaChange,
  onMediaClear,
  onMediaRemove,
  onSave
}) {
  return (
    <section className="paperPage memoryPage">
      <div className="pageHeading">
        <span>Page 3</span>
        <h2>Memories With Vinod</h2>
      </div>
      <div className="formGrid memoryForm">
        <TextArea
          label="Write your memory"
          name="vinodMemoryText"
          value={form.vinodMemoryText}
          onChange={onChange}
          placeholder="A moment, a message, or anything you want Vinod to remember"
        />
        <MemoryMediaPicker
          files={form.vinodMemoryFiles}
          onClear={onMediaClear}
          onMediaChange={onMediaChange}
          onRemove={onMediaRemove}
        />
      </div>
      {error ? <p className="formError">{error}</p> : null}
      {success ? <p className="formSuccess">{success}</p> : null}
      <div className="pageActions">
        <button className="ghostButton" onClick={onBack} type="button">
          Previous
        </button>
        <button className="primaryButton" disabled={saving} onClick={onSave} type="button">
          {saving ? "Saving..." : "Save Page"}
        </button>
      </div>
    </section>
  );
}

function SavedPageEmpty({ onNew }) {
  return (
    <section className="previewPage emptyPreview">
      <div>
        <p>Slam Book Page</p>
        <h2>No saved page selected</h2>
      </div>
      <button className="primaryButton" onClick={onNew} type="button">
        New Page
      </button>
    </section>
  );
}

function SavedPageOne({ entry, onNext, onNew }) {
  if (!entry) {
    return <SavedPageEmpty onNew={onNew} />;
  }

  return (
    <section className="paperPage savedReader">
      <PhotoFrame photo={entry.photo} />
      <div className="pageHeading">
        <span>Saved Page 1</span>
        <h2>All About {entry.nickname || entry.name}</h2>
      </div>
      <div className="detailGrid">
        <DetailValue label="Full Name" value={entry.name} />
        <DetailValue label="Admission Number" value={entry.admissionNumber} />
        <DetailValue label="Nickname" value={entry.nickname} />
        <DetailValue label="Date of Birth" value={entry.dob} />
        <DetailValue label="Phone" value={entry.phone} />
        <DetailValue label="Email" value={entry.email} />
        <DetailValue label="Best Friend" value={entry.bestFriend} />
        <DetailValue label="Ambition" value={entry.ambition} />
        <DetailValue label="Address" value={entry.address} />
      </div>
      <div className="pageActions">
        <button className="ghostButton" onClick={onNew} type="button">
          New Page
        </button>
        <button className="primaryButton" onClick={onNext} type="button">
          Page 2
        </button>
      </div>
    </section>
  );
}

function SavedPageTwo({ entry, onBack, onNew, onNext }) {
  if (!entry) {
    return <SavedPageEmpty onNew={onNew} />;
  }

  return (
    <section className="paperPage savedReader">
      <PhotoFrame photo={entry.photo} />
      <div className="pageHeading">
        <span>Saved Page 2</span>
        <h2>Favorites & Memories</h2>
      </div>
      <div className="detailGrid compact">
        <DetailValue label="Favourite Colour" value={entry.favoriteColor} />
        <DetailValue label="Favorite Song" value={entry.favoriteSong} />
        <DetailValue label="Favorite Movie" value={entry.favoriteMovie} />
        <DetailValue label="Favorite Food" value={entry.favoriteFood} />
        <DetailValue label="Hobby" value={entry.hobby} />
        <DetailValue label="Dream Place" value={entry.dreamPlace} />
        <DetailValue label="Describe me in 3 words" value={entry.firstMemory} wide />
        <DetailValue label="Funniest Moment" value={entry.funnyMoment} wide />
        <DetailValue label="Message For Me" value={entry.message} wide />
        <DetailValue label="Secret Wish" value={entry.secretWish} wide />
        <DetailValue label="Signature" value={entry.signature} />
      </div>
      <div className="pageActions">
        <button className="ghostButton" onClick={onBack} type="button">
          Page 1
        </button>
        <button className="primaryButton" onClick={onNext} type="button">
          Page 3
        </button>
      </div>
    </section>
  );
}

function SavedPageThree({ entry, onBack, onNew }) {
  if (!entry) {
    return <SavedPageEmpty onNew={onNew} />;
  }

  const hasMemory = entry.vinodMemoryText || getSavedMemoryFiles(entry).length > 0;

  return (
    <section className="paperPage savedReader memoryPage">
      <div className="pageHeading">
        <span>Saved Page 3</span>
        <h2>Memories With Vinod</h2>
      </div>
      <div className="memorySavedContent">
        {entry.vinodMemoryText ? (
          <div className="memoryTextCard">
            <span>Memory</span>
            <p>{entry.vinodMemoryText}</p>
          </div>
        ) : null}
        <MemoryMediaDisplay entry={entry} />
        {!hasMemory ? <p className="emptyState">No memory added.</p> : null}
      </div>
      <div className="pageActions">
        <button className="ghostButton" onClick={onBack} type="button">
          Page 2
        </button>
        <button className="primaryButton" onClick={onNew} type="button">
          New Page
        </button>
      </div>
    </section>
  );
}

function EntryPreview({ entry, onNew }) {
  if (!entry) {
    return (
      <section className="previewPage emptyPreview">
        <div>
          <p>Slam Book Page</p>
          <h2>No saved page selected</h2>
        </div>
        <button className="primaryButton" onClick={onNew} type="button">
          New Page
        </button>
      </section>
    );
  }

  const facts = [
    ["Nickname", entry.nickname],
    ["DOB", entry.dob],
    ["Phone", entry.phone],
    ["Email", entry.email],
    ["Best Friend", entry.bestFriend],
    ["Ambition", entry.ambition],
    ["Favourite Colour", entry.favoriteColor],
    ["Favorite Song", entry.favoriteSong],
    ["Favorite Movie", entry.favoriteMovie],
    ["Favorite Food", entry.favoriteFood],
    ["Hobby", entry.hobby],
    ["Dream Place", entry.dreamPlace]
  ].filter(([, value]) => value);

  return (
    <section className="previewPage">
      <div className="previewHeader">
        {entry.photo ? <img src={entry.photo} alt="" /> : <div />}
        <div>
          <p>Slam Book Page</p>
          <h2>{entry.name}</h2>
        </div>
      </div>
      <div className="previewFacts">
        {facts.map(([label, value]) => (
          <p key={label}>
            <strong>{label}</strong>
            <span>{value}</span>
          </p>
        ))}
      </div>
      <div className="memoryBlock">
        {entry.firstMemory ? (
          <p>
            <strong>Describe me in 3 words</strong>
            {entry.firstMemory}
          </p>
        ) : null}
        {entry.funnyMoment ? (
          <p>
            <strong>Funniest Moment</strong>
            {entry.funnyMoment}
          </p>
        ) : null}
        {entry.message ? (
          <p>
            <strong>Message</strong>
            {entry.message}
          </p>
        ) : null}
        {entry.secretWish ? (
          <p>
            <strong>Secret Wish</strong>
            {entry.secretWish}
          </p>
        ) : null}
      </div>
      {entry.signature ? <p className="signature">- {entry.signature}</p> : null}
      <div className="previewActions">
        <button className="primaryButton" onClick={onNew} type="button">
          New Page
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [page, setPage] = useState("cover");
  const [direction, setDirection] = useState("forward");
  const [session, setSession] = useState(null);
  const [loginMode, setLoginMode] = useState("user");
  const [loginValues, setLoginValues] = useState({
    name: "",
    admissionNumber: "",
    username: "",
    password: ""
  });
  const [loginError, setLoginError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [saving, setSaving] = useState(false);

  const visibleEntries = useMemo(() => {
    if (!session) {
      return [];
    }

    if (session.role === "admin") {
      return entries;
    }

    return entries.filter((entry) => matchesIdentity(entry, session));
  }, [entries, session]);

  const selectedEntry = useMemo(
    () => visibleEntries.find((entry) => entry.id === selectedId),
    [visibleEntries, selectedId]
  );

  useEffect(() => {
    let ignore = false;

    async function loadSavedEntries() {
      try {
        const data = await getEntries();

        if (!ignore) {
          setEntries(data.entries);
          setApiError("");
        }
      } catch (requestError) {
        if (!ignore) {
          setApiError(requestError.message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadSavedEntries();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!session || selectedId || visibleEntries.length === 0) {
      return;
    }

    setSelectedId(visibleEntries[0].id);
  }, [session, selectedId, visibleEntries]);

  const setPageWithTurn = (nextPage, nextDirection = "forward") => {
    setDirection(nextDirection);
    setError("");
    setSuccess("");
    setPage(nextPage);
  };

  const buildFormForSession = (activeSession) => {
    if (activeSession?.role !== "user") {
      return emptyForm;
    }

    return {
      ...emptyForm,
      name: activeSession.name,
      admissionNumber: activeSession.admissionNumber
    };
  };

  const handleLoginModeChange = (nextMode) => {
    setLoginMode(nextMode);
    setLoginError("");
  };

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginValues((current) => ({ ...current, [name]: value }));
  };

  const handleLogin = (event) => {
    event.preventDefault();
    setLoginError("");

    if (loginMode === "user") {
      const nextSession = {
        role: "user",
        name: loginValues.name.trim(),
        admissionNumber: loginValues.admissionNumber.trim()
      };

      if (!nextSession.name || !nextSession.admissionNumber) {
        setLoginError("Name and Admission Number are required for user login.");
        return;
      }

      setSession(nextSession);
      setForm(buildFormForSession(nextSession));
      setSelectedId("");
      setPageWithTurn("cover", "forward");
      return;
    }

    if (
      loginValues.username.trim() !== ADMIN_USERNAME ||
      loginValues.password !== ADMIN_PASSWORD
    ) {
      setLoginError("Invalid admin username or password.");
      return;
    }

    setSession({
      role: "admin",
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });
    setForm(emptyForm);
    setSelectedId("");
    setPageWithTurn("cover", "forward");
  };

  const handleLogout = () => {
    setSession(null);
    setSelectedId("");
    setForm(emptyForm);
    setPageWithTurn("cover", "back");
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, photo: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleMemoryMediaChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) {
      return;
    }

    const nextFiles = [];

    for (const file of selectedFiles) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        setError("Please choose only image or video files for your memory with Vinod.");
        event.target.value = "";
        return;
      }

      if (file.size > MAX_MEMORY_MEDIA_BYTES) {
        setError("Please choose image or video files under 100 MB each.");
        event.target.value = "";
        return;
      }

      nextFiles.push({
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        previewUrl: URL.createObjectURL(file)
      });
    }

    setForm((current) => ({
      ...current,
      vinodMemoryFiles: [...current.vinodMemoryFiles, ...nextFiles]
    }));
    setError("");
    event.target.value = "";
  };

  const handleMemoryMediaClear = () => {
    setForm((current) => {
      current.vinodMemoryFiles.forEach((memoryFile) => URL.revokeObjectURL(memoryFile.previewUrl));

      return {
        ...current,
        vinodMemoryFiles: []
      };
    });
  };

  const handleMemoryMediaRemove = (fileId) => {
    setForm((current) => {
      const removedFile = current.vinodMemoryFiles.find((memoryFile) => memoryFile.id === fileId);

      if (removedFile) {
        URL.revokeObjectURL(removedFile.previewUrl);
      }

      return {
        ...current,
        vinodMemoryFiles: current.vinodMemoryFiles.filter((memoryFile) => memoryFile.id !== fileId)
      };
    });
  };

  const validateEntryIdentity = () => {
    const id = makeEntryId(form.name, form.admissionNumber);

    if (!form.name.trim() || !form.admissionNumber.trim() || !id) {
      setError("Full Name and Admission Number are needed to save a unique slam book page.");
      return "";
    }

    if (entries.some((entry) => entry.id === id)) {
      setError("This admission number and name are already saved.");
      return "";
    }

    return id;
  };

  const handleNext = () => {
    if (validateEntryIdentity()) {
      setPageWithTurn("page2", "forward");
    }
  };

  const handleSecondPageNext = () => {
    setPageWithTurn("page3", "forward");
  };

  const handleSave = async () => {
    const id = validateEntryIdentity();

    if (!id) {
      return;
    }

    setSaving(true);

    try {
      const data = await createEntry(form);
      const nextEntries = [data.entry, ...entries];

      form.vinodMemoryFiles.forEach((memoryFile) => URL.revokeObjectURL(memoryFile.previewUrl));
      setEntries(nextEntries);
      setSelectedId(data.entry.id);
      setForm(buildFormForSession(session));
      setPageWithTurn("saved1", "forward");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectEntry = (entry) => {
    setSelectedId(entry.id);
    setPageWithTurn("saved1", "forward");
  };

  const handleDelete = async () => {
    if (!selectedId || session?.role !== "admin") {
      return;
    }

    try {
      await deleteEntry(selectedId, {
        username: session.username,
        password: session.password
      });

      const nextEntries = entries.filter((entry) => entry.id !== selectedId);
      const nextSelectedId = nextEntries[0]?.id || "";

      setEntries(nextEntries);
      setSelectedId(nextSelectedId);
      setPageWithTurn(nextSelectedId ? "saved1" : "cover", "back");
    } catch (requestError) {
      setApiError(requestError.message);
    }
  };

  const handleNewPage = () => {
    setForm(buildFormForSession(session));
    setSelectedId("");
    setPageWithTurn("page1", "forward");
  };

  const handleOpenBook = () => {
    if (session?.role === "user" && visibleEntries[0]) {
      setSelectedId(visibleEntries[0].id);
      setPageWithTurn("saved1", "forward");
      return;
    }

    handleNewPage();
  };

  const pageClass = `bookPageShell ${direction === "forward" ? "turnForward" : "turnBack"}`;
  const activeEntry = selectedEntry || visibleEntries[0];

  if (!session) {
    return (
      <LoginPage
        mode={loginMode}
        values={loginValues}
        error={loginError}
        onChange={handleLoginChange}
        onModeChange={handleLoginModeChange}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <main className="appShell">
      <div className="stageBackdrop" />
      <SessionBar session={session} onLogout={handleLogout} />
      <PageProgress page={page} />
      <div className="bookLayout">
        <div className="book">
          <div className="bookSpine" />
          <div className={pageClass} key={page}>
            {page === "cover" ? (
              <Cover entriesCount={visibleEntries.length} onOpen={handleOpenBook} />
            ) : null}
            {page === "page1" ? (
              <PageOne
                form={form}
                lockIdentity={session.role === "user"}
                onBack={() => setPageWithTurn("cover", "back")}
                onChange={handleChange}
                onNext={handleNext}
                onPhotoChange={handlePhotoChange}
                error={error}
              />
            ) : null}
            {page === "page2" ? (
              <PageTwo
                form={form}
                onBack={() => setPageWithTurn("page1", "back")}
                onChange={handleChange}
                onPhotoChange={handlePhotoChange}
                onNext={handleSecondPageNext}
              />
            ) : null}
            {page === "page3" ? (
              <PageThree
                form={form}
                onBack={() => setPageWithTurn("page2", "back")}
                onChange={handleChange}
                onMediaChange={handleMemoryMediaChange}
                onMediaClear={handleMemoryMediaClear}
                onMediaRemove={handleMemoryMediaRemove}
                onSave={handleSave}
                error={error}
                success={success}
                saving={saving}
              />
            ) : null}
            {page === "preview" ? <EntryPreview entry={activeEntry} onNew={handleNewPage} /> : null}
            {page === "saved1" ? (
              <SavedPageOne
                entry={activeEntry}
                onNew={handleNewPage}
                onNext={() => setPageWithTurn("saved2", "forward")}
              />
            ) : null}
            {page === "saved2" ? (
              <SavedPageTwo
                entry={activeEntry}
                onBack={() => setPageWithTurn("saved1", "back")}
                onNew={handleNewPage}
                onNext={() => setPageWithTurn("saved3", "forward")}
              />
            ) : null}
            {page === "saved3" ? (
              <SavedPageThree
                entry={activeEntry}
                onBack={() => setPageWithTurn("saved2", "back")}
                onNew={handleNewPage}
              />
            ) : null}
          </div>
        </div>
        <SavedList
          entries={visibleEntries}
          selectedId={selectedId}
          loading={loading}
          apiError={apiError}
          canDelete={session.role === "admin"}
          onDelete={handleDelete}
          onSelect={handleSelectEntry}
        />
      </div>
    </main>
  );
}
