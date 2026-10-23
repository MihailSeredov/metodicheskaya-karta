import { useEffect, useMemo, useState } from "react";
import bridge from "@vkontakte/vk-bridge";
import "./App.css";


const initialCities = [];
const initialMaterials = [];

function App() {


const [authInfo, setAuthInfo] = useState({
  status: "checking",
  message: "Проверяем авторизацию...",
  user: null,
});

const [authToken, setAuthToken] = useState("");
  
const [cities, setCities] = useState(() => {
  try {
    const saved = localStorage.getItem("methodicheskaya-map-cities");
    return saved ? JSON.parse(saved) : initialCities;
  } catch {
    return initialCities;
  }
});

const [materials, setMaterials] = useState(() => {
  try {
    const saved = localStorage.getItem("methodicheskaya-map-materials");
    return saved ? JSON.parse(saved) : initialMaterials;
  } catch {
    return initialMaterials;
  }
});

  const [selectedCity, setSelectedCity] = useState("");
  const [pendingCityPoint, setPendingCityPoint] = useState(null);
  const [newCityName, setNewCityName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    city: "",
    title: "",
    author: "",
    url: "",
    description: "",
  });


useEffect(() => {
  try {
    localStorage.setItem(
      "methodicheskaya-map-cities",
      JSON.stringify(cities)
    );
  } catch (error) {
    console.error("Не удалось сохранить города:", error);
  }
}, [cities]);

useEffect(() => {
  try {
    localStorage.setItem(
      "methodicheskaya-map-materials",
      JSON.stringify(materials)
    );
  } catch (error) {
    console.error("Не удалось сохранить материалы:", error);
  }
}, [materials]);


useEffect(() => {
  let cancelled = false;

  async function loginWithVK() {
    const launchParams = window.location.search.slice(1);
    const params = new URLSearchParams(launchParams);

    if (!params.has("sign") || !params.has("vk_user_id")) {
      setAuthInfo({
        status: "outside-vk",
        message: "Откройте приложение через ВКонтакте для входа.",
        user: null,
      });
      return;
    }

    try {
      await bridge.send("VKWebAppInit");

      const response = await fetch(
        "/api/auth/vk",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ launchParams }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Не удалось выполнить вход."
        );
      }

      if (cancelled) return;

      setAuthToken(data.token);
      setAuthInfo({
        status: "authenticated",
        message: "",
        user: data.user,
      });
    } catch (error) {
      if (cancelled) return;

      setAuthInfo({
        status: "error",
        message: error.message || "Ошибка авторизации VK.",
        user: null,
      });
    }
  }

  loginWithVK();

  return () => {
    cancelled = true;
  };
}, []);


  const cityMaterials = useMemo(() => {
    const query = search.toLowerCase().trim();

    return materials.filter((item) => {
      const matchesCity = item.city === selectedCity;
      const text = `${item.title} ${item.author} ${item.description}`;
      return matchesCity && text.toLowerCase().includes(query);
    });
  }, [materials, selectedCity, search]);

  // Нажатие на контур карты
  function handleMapClick(event) {
    const svg = event.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();

    const x = Math.round(
      ((event.clientX - rect.left) / rect.width) * 960
    );
    const y = Math.round(
      ((event.clientY - rect.top) / rect.height) * 410
    );

    setPendingCityPoint({ x, y });
    setNewCityName("");
  }

  // Добавление города
  function addCity(event) {
    event.preventDefault();

    const name = newCityName.trim();

    if (!name || !pendingCityPoint) return;

    if (
      cities.some(
        (city) => city.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      alert("Такой город уже добавлен!");
      return;
    }

    const newCity = {
      id: Date.now(),
      name,
      x: pendingCityPoint.x,
      y: pendingCityPoint.y,
    };

    setCities((previous) => [...previous, newCity]);
    setSelectedCity(name);
    setForm((previous) => ({ ...previous, city: name }));
    setPendingCityPoint(null);
    setNewCityName("");
    setSearch("");
  }

  // Изменение полей формы материала
  function updateForm(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  // Добавление материала
  function addMaterial(event) {
    event.preventDefault();

    if (!cities.some((city) => city.name === form.city)) {
      alert("Сначала добавьте город на карту.");
      return;
    }

    const material = {
      ...form,
      id: Date.now(),
    };

    setMaterials((previous) => [...previous, material]);
    setSelectedCity(form.city);
    setSearch("");
    setShowForm(false);

    setForm({
      city: form.city,
      title: "",
      author: "",
      url: "",
      description: "",
    });
  }

  function openMaterialForm(cityName = selectedCity) {
    if (cities.length === 0) {
      alert("Сначала нажмите на контур карты и добавьте город.");
      return;
    }

    setForm((previous) => ({
      ...previous,
      city: cityName || cities[0].name,
    }));

    setShowForm(true);
  }

  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(event) => event.preventDefault()}
        >
          <span className="brand-icon">М</span>
          <span>
            <strong>МЕТОДИЧЕСКАЯ КАРТА</strong>
            <small>Педагоги России · Обмен опытом</small>
          </span>
        </a>

        <span className="prototype-label">ПРОТОТИП</span>
      </header>


<div
  style={{
    padding: "10px 20px",
    background: "#ffffff",
    borderBottom: "1px solid #e5e7eb",
    fontSize: "14px",
  }}
>
  {authInfo.status === "authenticated" ? (
    <>
      ВКонтакте · ID {authInfo.user.vkUserId} ·{" "}
      {authInfo.user.isAdmin
        ? "Администратор"
        : "Педагог"}
    </>
  ) : (
    authInfo.message
  )}
</div>


      <main className="page">
        <section className="intro">
          <div>
            <p className="eyebrow">ЕДИНОЕ ПРОСТРАНСТВО ПЕДАГОГОВ</p>
            <h1>Полезные идеи со всей России</h1>
            <p className="subtitle">
              Выбирайте город на карте и знакомьтесь с
              методическими материалами коллег.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={() =>
              showForm
                ? setShowForm(false)
                : openMaterialForm()
            }
          >
            {showForm ? "Закрыть форму" : "+ Добавить материал"}
          </button>
        </section>

        {showForm && (
          <form className="material-form" onSubmit={addMaterial}>
            <h2>Новый материал</h2>
            <p>
              Добавьте ссылку на публикацию или разработку
              в ВКонтакте.
            </p>

            <label>
              Город
              <select
                name="city"
                value={form.city}
                onChange={updateForm}
                required
              >
                <option value="" disabled>
                  Выберите город
                </option>
                {cities.map((city) => (
                  <option key={city.id} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Название материала
              <input
                name="title"
                value={form.title}
                onChange={updateForm}
                placeholder="Например, игровые технологии"
                required
              />
            </label>

            <label>
              Имя автора
              <input
                name="author"
                value={form.author}
                onChange={updateForm}
                placeholder="Имя и фамилия"
                required
              />
            </label>

            <label>
              Ссылка на материал
              <input
                name="url"
                type="url"
                value={form.url}
                onChange={updateForm}
                placeholder="https://vk.com/..."
                required
              />
            </label>

            <label>
              Описание
              <textarea
                name="description"
                value={form.description}
                onChange={updateForm}
                placeholder="Краткое описание материала"
                rows="3"
              />
            </label>

            <button className="primary-button" type="submit">
              Добавить материал
            </button>
          </form>
        )}

        <div className="workspace">
          <section className="map-card">
            <div className="section-heading">
              <div>
                <h2>Карта России</h2>
                <p>
                  Нажмите на контур карты, чтобы добавить город.
                </p>
              </div>
              <span className="city-counter">
                {cities.length} городов
              </span>
            </div>

            <div className="map-wrap">
              <svg
                className="russia-map"
                viewBox="0 0 960 410"
                role="img"
                aria-label="Схематичная карта России. Нажмите на контур, чтобы добавить город."
              >
                <defs>
                  <pattern
                    id="mapDots"
                    width="18"
                    height="18"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle
                      cx="2"
                      cy="2"
                      r="1"
                      fill="#d7e2e7"
                    />
                  </pattern>
                </defs>

                <rect
                  width="960"
                  height="410"
                  fill="url(#mapDots)"
                />

                <polygon
                  className="land"
                  style={{ cursor: "crosshair" }}
                  onClick={handleMapClick}
                  points="50,160 85,120 130,105 170,75 225,90 265,75 315,100 365,92 410,112 455,105 500,125 550,115 600,140 650,130 695,150 740,160 785,180 840,175 905,200 930,225 900,250 855,258 835,285 790,295 755,325 710,310 665,340 620,325 575,345 530,315 485,325 440,295 395,305 355,280 310,295 270,265 225,275 190,250 150,260 120,225 80,220 55,190"
                />

                {cities.map((city) => {
                  const active = selectedCity === city.name;

                  return (
                    <g
                      key={city.id}
                      className={`map-marker ${active ? "active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedCity(city.name);
                        setForm((previous) => ({
                          ...previous,
                          city: city.name,
                        }));
                        setSearch("");
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Материалы города ${city.name}`}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          event.preventDefault();
                          setSelectedCity(city.name);
                          setForm((previous) => ({
                            ...previous,
                            city: city.name,
                          }));
                        }
                      }}
                    >
                      {active && (
                        <circle
                          cx={city.x}
                          cy={city.y}
                          r="15"
                          className="marker-halo"
                        />
                      )}

                      <circle
                        cx={city.x}
                        cy={city.y}
                        r={active ? 7 : 5}
                        className="marker-dot"
                      />

                      <text
                        x={city.x}
                        y={city.y - 13}
                        textAnchor="middle"
                        className="marker-label"
                      >
                        {city.name}
                      </text>
                    </g>
                  );
                })}

                {pendingCityPoint && (
                  <g className="map-marker active">
                    <circle
                      cx={pendingCityPoint.x}
                      cy={pendingCityPoint.y}
                      r="14"
                      className="marker-halo"
                    />
                    <circle
                      cx={pendingCityPoint.x}
                      cy={pendingCityPoint.y}
                      r="6"
                      className="marker-dot"
                    />
                  </g>
                )}
              </svg>
            </div>

            {pendingCityPoint && (
              <form
                className="material-form"
                onSubmit={addCity}
              >
                <h2>Добавить город</h2>
                <p>
                  Укажите название города для выбранной точки.
                </p>

                <label>
                  Название города
                  <input
                    value={newCityName}
                    onChange={(event) =>
                      setNewCityName(event.target.value)
                    }
                    placeholder="Например, Челябинск"
                    required
                    autoFocus
                  />
                </label>

                <button
                  className="primary-button"
                  type="submit"
                >
                  Добавить город
                </button>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setPendingCityPoint(null)}
                >
                  Отмена
                </button>
              </form>
            )}

            <div className="map-legend">
              <span className="legend-dot" />
              Выбранный город
              <span className="legend-note">
                Карта пока схематичная
              </span>
            </div>

            <div className="city-list">
              {cities.map((city) => (
                <button
                  key={city.id}
                  className={`city-chip ${
                    selectedCity === city.name ? "selected" : ""
                  }`}
                  onClick={() => {
                    setSelectedCity(city.name);
                    setForm((previous) => ({
                      ...previous,
                      city: city.name,
                    }));
                    setSearch("");
                  }}
                >
                  {city.name}
                  <span>
                    {
                      materials.filter(
                        (item) => item.city === city.name
                      ).length
                    }
                  </span>
                </button>
              ))}

              {cities.length === 0 && (
                <p className="demo-note">
                  Городов пока нет. Нажмите на контур карты,
                  чтобы добавить первый город.
                </p>
              )}
            </div>
          </section>

          <section className="materials-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">МАТЕРИАЛЫ ГОРОДА</p>
                <h2>{selectedCity || "Выберите город"}</h2>
                <p>{cityMaterials.length} материалов</p>
              </div>
              <span className="city-icon">⌖</span>
            </div>

            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по материалам..."
              aria-label="Поиск по материалам"
            />

            <div className="materials-list">
              {cityMaterials.map((item) => (
                <article className="material-item" key={item.id}>
                  <span className="material-tag">{item.city}</span>
                  <h3>{item.title}</h3>
                  <p>
                    {item.description || "Описание не добавлено."}
                  </p>

                  <div className="material-footer">
                    <span>Автор: {item.author}</span>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Открыть материал ↗
                    </a>
                  </div>
                </article>
              ))}

              {cityMaterials.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">⌖</span>
                  <h3>
                    {selectedCity
                      ? "Пока нет материалов"
                      : "Выберите город на карте"}
                  </h3>
                  <p>
                    {selectedCity
                      ? "Добавьте первую публикацию для этого города."
                      : "Нажмите на контур карты, добавьте город и затем прикрепите материалы."}
                  </p>

                  {selectedCity && (
                    <button
                      className="secondary-button"
                      onClick={() => openMaterialForm(selectedCity)}
                    >
                      Добавить материал
                    </button>
                  )}
                </div>
              )}
            </div>

            <p className="demo-note">
              Прототип. Данные пока не сохраняются после перезагрузки.
            </p>
          </section>
        </div>

        <footer className="footer">
          <span>Методическая карта педагогов России</span>
          <span>Прототип · Версия 0.2</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
